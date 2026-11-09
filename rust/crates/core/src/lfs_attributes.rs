//! Read-only equivalent of Git LFS 3.8.1 `track --json` pattern inspection.
//!
//! The native command initializes lfs.repositoryformatversion even when listing.
//! Discovery, parsing, macro expansion, and presentation below follow
//! git-lfs/git-lfs v3.8.1 git/gitattr and commands/command_track.go instead.
//! No Git LFS command, configuration write, or working-file write is performed.
//!
//! Attribute parsing/discovery: Git LFS 3.8.1 and git-lfs/wildmatch 2.0.1 (MIT).
//! Source ordering: Go sort.Slice pdqsort (BSD-3-Clause).
//! Copyright (c) 2014- GitHub, Inc. and Git LFS contributors.
//! Copyright (c) 2018- GitHub, Inc. and Git LFS contributors.
//! Copyright 2009, 2022 The Go Authors. All rights reserved.
//! License texts and primary source links: rust/THIRD_PARTY_NOTICES.txt.
use crate::{Repository, args, cancellation, os_from_bytes, process};
use anyhow::{Result, bail, ensure};
use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::{OsStr, OsString},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) struct Pattern {
    pub pattern: String,
    pub source: String,
    pub lockable: bool,
    pub tracked: bool,
}

pub(crate) async fn inspect(repository: &Repository) -> Result<Vec<Pattern>> {
    let local_version = config(repository.path(), true, "lfs.repositoryformatversion").await?;
    if let Some(version) = local_version {
        let version = trim_config_output(&version);
        ensure!(
            version.is_empty() || version == b"0",
            "Unknown Git LFS repository format version; update desktop-rs before inspecting attributes"
        );
    }
    let version = process::run(repository.path(), &args(&["--version"])).await?;
    ensure!(
        version.code == 0,
        "Cannot inspect the installed Git version"
    );
    let version = git_version(&version.stdout)?;
    ensure!(
        version >= (2, 0),
        "Git LFS requires Git version 2.0 or newer"
    );

    // Git LFS 3.8.1 erroneously treats Git's deliberately absent system path as
    // fatal under GIT_ATTR_NOSYSTEM. Respect Git's explicit opt-out instead.
    let system = if no_system_attributes() {
        None
    } else if version >= (2, 42) {
        let output = process::run(repository.path(), &args(&["var", "GIT_ATTR_SYSTEM"])).await?;
        ensure!(output.code == 0, "Cannot find Git system attributes");
        let first = output
            .stdout
            .split(|byte| *byte == b'\n')
            .next()
            .unwrap_or_default();
        (!first.is_empty())
            .then(|| os_from_bytes(first).map(PathBuf::from))
            .transpose()?
    } else {
        Some(
            std::env::var_os("PREFIX")
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(std::path::MAIN_SEPARATOR.to_string()))
                .join("etc")
                .join("gitattributes"),
        )
    };
    let user = user_attributes(repository.path()).await?;
    let git_dir = repository.git_directory().await?;
    let mut command = args(&["ls-files", "-z", "--cached"]);
    if version >= (2, 35) {
        command.push("--sparse".into());
    }
    command.extend(args(&["--exclude-standard", "--others"]));
    let files = process::run(repository.path(), &command).await?;
    ensure!(files.code == 0, "Cannot discover Git attribute files");
    ensure!(
        files.stdout.is_empty() || files.stdout.last() == Some(&0),
        "Invalid Git attribute file inventory"
    );
    let mut attributes = Vec::new();
    let info = git_dir.join("info").join("attributes");
    if fs::metadata(&info).is_ok_and(|m| !m.is_dir()) {
        attributes.push(AttributeFile {
            path: info,
            read_macros: true,
        });
    }
    for name in files
        .stdout
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
    {
        if name.rsplit(|byte| *byte == b'/').next() == Some(b".gitattributes".as_slice()) {
            let relative = PathBuf::from(os_from_bytes(name)?);
            ensure!(
                !relative.is_absolute()
                    && relative
                        .components()
                        .all(|c| !matches!(c, Component::ParentDir)),
                "Invalid Git attribute file path"
            );
            attributes.push(AttributeFile {
                path: repository.path().join(relative),
                read_macros: name == b".gitattributes",
            });
        }
    }
    // Equal-length source order is observable through macro expansion. Match
    // Go sort.Slice's pdqsort, including its deliberately unstable tie order.
    let order = go_source_order(
        &attributes
            .iter()
            .map(|file| path_len(&file.path))
            .collect::<Vec<_>>(),
    );
    let mut slots: Vec<_> = attributes.into_iter().map(Some).collect();
    let attributes: Vec<_> = order
        .into_iter()
        .map(|index| slots[index].take().expect("source permutation"))
        .collect();
    let root = repository.path().to_owned();
    cancellation::blocking(move || {
        inspect_files(&root, system.as_deref(), user.as_deref(), &attributes)
    })
    .await
}

async fn config(path: &Path, local: bool, key: &str) -> Result<Option<Vec<u8>>> {
    let mut command = args(&["config", "--includes", "--null"]);
    if local {
        command.push("--local".into());
    }
    command.extend(args(&["--get", key]));
    let output = process::configuration(path, &command).await?;
    if output.code == 1 {
        return Ok(None);
    }
    ensure!(output.code == 0, "Cannot read Git attribute configuration");
    let value = output
        .stdout
        .strip_suffix(&[0])
        .ok_or_else(|| anyhow::anyhow!("Invalid Git attribute configuration"))?;
    Ok(Some(value.to_vec()))
}

async fn user_attributes(path: &Path) -> Result<Option<PathBuf>> {
    let configured = config(path, false, "core.attributesfile")
        .await?
        .unwrap_or_default();
    let raw = if configured.is_empty() {
        if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
            return Ok(Some(PathBuf::from(xdg).join("git").join("attributes")));
        }
        b"~/.config/git/attributes".to_vec()
    } else {
        configured
    };
    if raw.first() != Some(&b'~') {
        return Ok(Some(PathBuf::from(os_from_bytes(&raw)?)));
    }
    let slash = raw
        .iter()
        .position(|byte| *byte == b'/')
        .unwrap_or(raw.len());
    if slash == 1 {
        let home = std::env::var_os("HOME").unwrap_or_default();
        let tail = if home.is_empty() {
            &raw[slash..]
        } else {
            raw.get(slash + 1..).unwrap_or_default()
        };
        return Ok(Some(PathBuf::from(home).join(os_from_bytes(tail)?)));
    }
    // Let Git perform the platform's named-user home lookup, only for a leading
    // ~user path. Other values retain Git LFS's literal path interpretation.
    let mut entry = OsString::from("desktop-lfs.attributes-path=");
    entry.push(os_from_bytes(&raw)?);
    if slash == raw.len() {
        entry.push("/");
    }
    let mut command = args(&["-c"]);
    command.push(entry);
    command.extend(args(&[
        "config",
        "--path",
        "--null",
        "--get",
        "desktop-lfs.attributes-path",
    ]));
    let output = process::configuration(path, &command).await?;
    ensure!(
        output.code == 0,
        "Cannot resolve the Git attributes user directory"
    );
    let value = output
        .stdout
        .strip_suffix(&[0])
        .ok_or_else(|| anyhow::anyhow!("Invalid Git attributes user directory"))?;
    Ok(Some(PathBuf::from(os_from_bytes(value)?)))
}

// subprocess.Output in Git LFS trims exactly ASCII space and LF, not tabs,
// CR, or Unicode whitespace. Its local format comparison inherits that rule.
fn trim_config_output(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !matches!(byte, b' ' | b'\n'))
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|byte| !matches!(byte, b' ' | b'\n'))
        .map_or(start, |index| index + 1);
    &bytes[start..end]
}
fn no_system_attributes() -> bool {
    std::env::var_os("GIT_ATTR_NOSYSTEM").is_some_and(|value| {
        let value = value.to_string_lossy().to_ascii_lowercase();
        matches!(value.as_str(), "true" | "yes" | "on")
            || value.parse::<i64>().is_ok_and(|number| number != 0)
    })
}
fn git_version(bytes: &[u8]) -> Result<(u32, u32)> {
    let value = bytes
        .strip_prefix(b"git version ")
        .ok_or_else(|| anyhow::anyhow!("Unrecognized Git version"))?;
    let mut parts = value.split(|byte| *byte == b'.');
    let major = std::str::from_utf8(parts.next().unwrap_or_default())
        .ok()
        .and_then(|v| v.parse().ok());
    let minor = std::str::from_utf8(parts.next().unwrap_or_default())
        .ok()
        .and_then(|v| v.parse().ok());
    match (major, minor) {
        (Some(major), Some(minor)) => Ok((major, minor)),
        _ => bail!("Unrecognized Git version"),
    }
}
fn path_len(path: &Path) -> usize {
    #[cfg(unix)]
    {
        path.as_os_str().as_encoded_bytes().len()
    }
    #[cfg(not(unix))]
    {
        path.to_string_lossy().len()
    }
}

// Go sort.Slice uses pdqsort_func (Go's BSD-licensed src/sort/zsortfunc.go).
// Keep this narrow index sort rather than changing native tie order by using
// Rust's stable sort or its independently implemented unstable sort.
fn go_source_order(keys: &[usize]) -> Vec<usize> {
    let length = keys.len();
    let mut sort = SourceSort {
        keys,
        order: (0..length).collect(),
    };
    sort.pdqsort(0, length, (usize::BITS - length.leading_zeros()) as usize);
    sort.order
}
struct SourceSort<'a> {
    keys: &'a [usize],
    order: Vec<usize>,
}
impl SourceSort<'_> {
    fn less(&self, a: usize, b: usize) -> bool {
        self.keys[self.order[a]] > self.keys[self.order[b]]
    }
    fn insertion(&mut self, a: usize, b: usize) {
        for i in a + 1..b {
            let mut j = i;
            while j > a && self.less(j, j - 1) {
                self.order.swap(j, j - 1);
                j -= 1;
            }
        }
    }
    fn sift_down(&mut self, mut root: usize, high: usize, first: usize) {
        loop {
            let mut child = 2 * root + 1;
            if child >= high {
                return;
            }
            if child + 1 < high && self.less(first + child, first + child + 1) {
                child += 1;
            }
            if !self.less(first + root, first + child) {
                return;
            }
            self.order.swap(first + root, first + child);
            root = child;
        }
    }
    fn heap(&mut self, a: usize, b: usize) {
        let length = b - a;
        for i in (0..=(length - 1) / 2).rev() {
            self.sift_down(i, length, a);
        }
        for i in (0..length).rev() {
            self.order.swap(a, a + i);
            self.sift_down(0, i, a);
        }
    }
    fn pdqsort(&mut self, mut a: usize, mut b: usize, mut limit: usize) {
        let (mut balanced, mut partitioned) = (true, true);
        loop {
            let length = b - a;
            if length <= 12 {
                self.insertion(a, b);
                return;
            }
            if limit == 0 {
                self.heap(a, b);
                return;
            }
            if !balanced {
                self.break_patterns(a, b);
                limit -= 1;
            }
            let (mut pivot, mut hint) = self.pivot(a, b);
            if hint == -1 {
                self.order[a..b].reverse();
                pivot = (b - 1) - (pivot - a);
                hint = 1;
            }
            if balanced && partitioned && hint == 1 && self.partial_insertion(a, b) {
                return;
            }
            if a > 0 && !self.less(a - 1, pivot) {
                a = self.partition_equal(a, b, pivot);
                continue;
            }
            let (mid, already) = self.partition(a, b, pivot);
            partitioned = already;
            let (left, right) = (mid - a, b - mid);
            if left < right {
                balanced = left >= length / 8;
                self.pdqsort(a, mid, limit);
                a = mid + 1;
            } else {
                balanced = right >= length / 8;
                self.pdqsort(mid + 1, b, limit);
                b = mid;
            }
        }
    }
    fn partition(&mut self, a: usize, b: usize, pivot: usize) -> (usize, bool) {
        self.order.swap(a, pivot);
        let (mut i, mut j) = (a + 1, b - 1);
        while i <= j && self.less(i, a) {
            i += 1;
        }
        while i <= j && !self.less(j, a) {
            j -= 1;
        }
        if i > j {
            self.order.swap(j, a);
            return (j, true);
        }
        self.order.swap(i, j);
        i += 1;
        j -= 1;
        loop {
            while i <= j && self.less(i, a) {
                i += 1;
            }
            while i <= j && !self.less(j, a) {
                j -= 1;
            }
            if i > j {
                break;
            }
            self.order.swap(i, j);
            i += 1;
            j -= 1;
        }
        self.order.swap(j, a);
        (j, false)
    }
    fn partition_equal(&mut self, a: usize, b: usize, pivot: usize) -> usize {
        self.order.swap(a, pivot);
        let (mut i, mut j) = (a + 1, b - 1);
        loop {
            while i <= j && !self.less(a, i) {
                i += 1;
            }
            while i <= j && self.less(a, j) {
                j -= 1;
            }
            if i > j {
                break;
            }
            self.order.swap(i, j);
            i += 1;
            j -= 1;
        }
        i
    }
    fn partial_insertion(&mut self, a: usize, b: usize) -> bool {
        let mut i = a + 1;
        for _ in 0..5 {
            while i < b && !self.less(i, i - 1) {
                i += 1;
            }
            if i == b {
                return true;
            }
            if b - a < 50 {
                return false;
            }
            self.order.swap(i, i - 1);
            if i - a >= 2 {
                let mut j = i - 1;
                while j >= 1 && self.less(j, j - 1) {
                    self.order.swap(j, j - 1);
                    j -= 1;
                }
            }
            if b - i >= 2 {
                let mut j = i + 1;
                while j < b && self.less(j, j - 1) {
                    self.order.swap(j, j - 1);
                    j += 1;
                }
            }
        }
        false
    }
    fn break_patterns(&mut self, a: usize, b: usize) {
        let length = b - a;
        if length < 8 {
            return;
        }
        let mut random = length as u64;
        let modulus = 1usize << (usize::BITS - length.leading_zeros());
        let middle = a + (length / 4) * 2;
        for index in middle - 1..=middle + 1 {
            random ^= random.wrapping_shl(13);
            random ^= random >> 7;
            random ^= random.wrapping_shl(17);
            let mut other = random as usize & (modulus - 1);
            if other >= length {
                other -= length;
            }
            self.order.swap(index, a + other);
        }
    }
    fn order2(&self, a: usize, b: usize, swaps: &mut usize) -> (usize, usize) {
        if self.less(b, a) {
            *swaps += 1;
            (b, a)
        } else {
            (a, b)
        }
    }
    fn median(&self, a: usize, b: usize, c: usize, swaps: &mut usize) -> usize {
        let (a, b) = self.order2(a, b, swaps);
        let (b, _) = self.order2(b, c, swaps);
        self.order2(a, b, swaps).1
    }
    fn pivot(&self, a: usize, b: usize) -> (usize, i8) {
        let length = b - a;
        let mut swaps = 0;
        let (mut i, mut j, mut k) = (a + length / 4, a + length / 4 * 2, a + length / 4 * 3);
        if length >= 8 {
            if length >= 50 {
                i = self.median(i - 1, i, i + 1, &mut swaps);
                j = self.median(j - 1, j, j + 1, &mut swaps);
                k = self.median(k - 1, k, k + 1, &mut swaps);
            }
            j = self.median(i, j, k, &mut swaps);
        }
        (
            j,
            match swaps {
                0 => 1,
                12 => -1,
                _ => 0,
            },
        )
    }
}

struct AttributeFile {
    path: PathBuf,
    read_macros: bool,
}
const ATTRIBUTE_INSPECTION_BUDGET: usize = 2 * 1024 * 1024;
fn inspect_files(
    root: &Path,
    system: Option<&Path>,
    user: Option<&Path>,
    files: &[AttributeFile],
) -> Result<Vec<Pattern>> {
    let mut processor = MacroProcessor::new();
    // Retain the process runner's existing 2 MiB inspection budget, shared by
    // all sources. Check cancellation between bounded regular-file reads.
    let mut budget = ATTRIBUTE_INSPECTION_BUDGET;
    let mut exposed = OutputBudget {
        remaining: ATTRIBUTE_INSPECTION_BUDGET - 32,
    };
    let system_patterns =
        external_patterns(root, system, &mut processor, &mut budget, &mut exposed)?;
    let user_patterns = external_patterns(root, user, &mut processor, &mut budget, &mut exposed)?;
    let mut patterns = Vec::new();
    for file in files {
        if let Some(bytes) = read_attributes(&file.path, false, &mut budget)? {
            patterns.extend(processor.parse_with_budget(
                &bytes,
                &source_path(root, &file.path),
                file.read_macros,
                &mut exposed,
            )?);
        }
    }
    patterns.extend(user_patterns);
    patterns.extend(system_patterns);
    Ok(patterns)
}
fn external_patterns(
    root: &Path,
    path: Option<&Path>,
    processor: &mut MacroProcessor,
    budget: &mut usize,
    exposed: &mut OutputBudget,
) -> Result<Vec<Pattern>> {
    let Some(path) = path else {
        return Ok(Vec::new());
    };
    let actual = if path.is_absolute() {
        path.to_owned()
    } else {
        root.join(path)
    };
    let Some(bytes) = read_attributes(&actual, true, budget)? else {
        return Ok(Vec::new());
    };
    // filepath.Rel("", absolutePath) returns an error and an empty string in
    // Git LFS. Preserve its displayed blank source for absolute global paths.
    let source = if path.is_absolute() {
        Vec::new()
    } else {
        clean_native(path).as_os_str().as_encoded_bytes().to_vec()
    };
    processor.parse_with_budget(&bytes, &source, true, exposed)
}
fn read_attributes(path: &Path, external: bool, budget: &mut usize) -> Result<Option<Vec<u8>>> {
    let cancellation = cancellation::Cancellation::current();
    cancellation.check()?;
    // Preflight also avoids opening native device/pipe paths on Windows. On
    // Unix O_NONBLOCK closes the metadata/open race for FIFOs and symlinks to
    // them; the descriptor's metadata is checked again before reading.
    match fs::metadata(path) {
        Ok(metadata) if !metadata.is_file() => {
            ensure!(!external, "Global Git attributes must be a regular file");
            return Ok(None);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => {
            ensure!(!external, "Cannot inspect global Git attributes");
            return Ok(None);
        }
        _ => {}
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK | libc::O_CLOEXEC);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(_) => {
            ensure!(!external, "Cannot open global Git attributes");
            return Ok(None);
        }
    };
    let metadata = match file.metadata() {
        Ok(metadata) if metadata.is_file() => metadata,
        _ => {
            ensure!(!external, "Global Git attributes must be a regular file");
            return Ok(None);
        }
    };
    ensure!(
        metadata.len() <= *budget as u64,
        "Git attribute content exceeds the inspection limit"
    );
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        cancellation.check()?;
        let count = match file.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => {
                ensure!(!external, "Cannot read global Git attributes");
                return Ok(None);
            }
        };
        ensure!(
            count <= *budget,
            "Git attribute content exceeds the inspection limit"
        );
        *budget -= count;
        bytes.extend_from_slice(&buffer[..count]);
    }
    cancellation.check()?;
    Ok(Some(bytes))
}

// Account incrementally for the exposed JSON, before retaining each row. The
// fixed overhead is conservative for native track's indented object format;
// strings include Go's HTML/control escaping and replacement-rune worst case.
struct OutputBudget {
    remaining: usize,
}
impl OutputBudget {
    fn reserve(&mut self, pattern: &str, source: &str) -> Result<()> {
        let size = 128usize
            .checked_add(json_string_cost(pattern))
            .and_then(|size| size.checked_add(json_string_cost(source)))
            .ok_or_else(|| anyhow::anyhow!("Git attribute output exceeds the inspection limit"))?;
        ensure!(
            size <= self.remaining,
            "Git attribute output exceeds the inspection limit"
        );
        self.remaining -= size;
        Ok(())
    }
}
fn json_string_cost(value: &str) -> usize {
    value.chars().fold(2usize, |size, character| {
        size.saturating_add(match character {
            '"' | '\\' | '\u{8}' | '\u{c}' | '\n' | '\r' | '\t' => 2,
            '\u{0}'..='\u{1f}' | '<' | '>' | '&' | '\u{2028}' | '\u{2029}' | '\u{fffd}' => 6,
            character => character.len_utf8(),
        })
    })
}

#[derive(Clone)]
struct Attr {
    key: Vec<u8>,
    value: Vec<u8>,
    unspecified: bool,
}
enum Line {
    Pattern(Vec<u8>, Vec<Attr>),
    Macro(Vec<u8>, Vec<Attr>),
}
struct MacroProcessor {
    macros: HashMap<Vec<u8>, Vec<Attr>>,
}
impl MacroProcessor {
    fn new() -> Self {
        let attrs = [b"diff".as_slice(), b"merge", b"text"]
            .into_iter()
            .map(|key| Attr {
                key: key.to_vec(),
                value: b"false".to_vec(),
                unspecified: false,
            })
            .collect();
        Self {
            macros: HashMap::from([(b"binary".to_vec(), attrs)]),
        }
    }
    #[cfg(test)]
    fn parse(&mut self, bytes: &[u8], source: &[u8], read_macros: bool) -> Vec<Pattern> {
        self.parse_with_budget(
            bytes,
            source,
            read_macros,
            &mut OutputBudget {
                remaining: usize::MAX,
            },
        )
        .unwrap()
    }
    fn parse_with_budget(
        &mut self,
        bytes: &[u8],
        source: &[u8],
        read_macros: bool,
        exposed: &mut OutputBudget,
    ) -> Result<Vec<Pattern>> {
        let Some(lines) = parse_lines(bytes) else {
            return Ok(Vec::new());
        };
        let directory = source
            .iter()
            .rposition(|byte| is_separator(*byte))
            .map_or(&b""[..], |index| &source[..index]);
        let directory = slash_native(directory);
        let mut patterns = Vec::new();
        for line in lines {
            match line {
                Line::Macro(name, attrs) => {
                    if read_macros {
                        self.macros.insert(name, attrs);
                    }
                }
                Line::Pattern(pattern, attrs) => {
                    let mut expanded = Vec::new();
                    for attr in attrs {
                        if let Some(macros) = self.macros.get(&attr.key) {
                            if attr.value == b"true" {
                                expanded.extend(macros.iter().cloned());
                            } else if attr.unspecified {
                                expanded.extend(macros.iter().map(|m| Attr {
                                    key: m.key.clone(),
                                    value: Vec::new(),
                                    unspecified: true,
                                }));
                            }
                        }
                        expanded.push(attr);
                    }
                    let (mut has_filter, mut tracked, mut lockable) = (false, false, false);
                    for attr in expanded {
                        if attr.key == b"filter" {
                            has_filter = true;
                            tracked = attr.value == b"lfs";
                        } else if attr.key == b"lockable" && attr.value == b"true" {
                            lockable = true;
                        }
                    }
                    if has_filter || lockable {
                        let pattern = if directory.is_empty() {
                            pattern
                        } else {
                            clean_slash(&[directory.as_slice(), b"/", pattern.as_slice()].concat())
                        };
                        let pattern = go_string(&pattern);
                        let source = go_string(source);
                        exposed.reserve(&pattern, &source)?;
                        patterns.push(Pattern {
                            pattern,
                            source,
                            lockable,
                            tracked,
                        });
                    }
                }
            }
        }
        Ok(patterns)
    }
}

fn parse_lines(bytes: &[u8]) -> Option<Vec<Line>> {
    let mut lines = Vec::new();
    for raw in bytes.split(|byte| *byte == b'\n') {
        // bufio.Scanner's default maximum token buffer is 64 KiB.
        if raw.len() >= 64 * 1024 {
            return None;
        }
        let text = trim_space(raw);
        if text.is_empty() || text.first() == Some(&b'#') {
            continue;
        }
        let (pattern, name, applied) = if text[0] == b'"' {
            let last = text.iter().rposition(|byte| *byte == b'"')?;
            if last == 0 {
                return None;
            }
            (
                unquote(&text[..=last])?,
                Vec::new(),
                trim_space(&text[last + 1..]),
            )
        } else {
            let split = text
                .iter()
                .position(|byte| *byte == b' ')
                .unwrap_or(text.len());
            let first = &text[..split];
            let applied = text.get(split + 1..).unwrap_or_default();
            if let Some(name) = first.strip_prefix(b"[attr]") {
                (Vec::new(), name.to_vec(), applied)
            } else {
                (first.to_vec(), Vec::new(), applied)
            }
        };
        let attrs = applied
            .split(|byte| *byte == b' ')
            .filter(|attr| !attr.is_empty())
            .map(|value| {
                if let Some(key) = value.strip_prefix(b"-") {
                    Attr {
                        key: key.to_vec(),
                        value: b"false".to_vec(),
                        unspecified: false,
                    }
                } else if let Some(key) = value.strip_prefix(b"!") {
                    Attr {
                        key: key.to_vec(),
                        value: Vec::new(),
                        unspecified: true,
                    }
                } else if let Some(eq) = value.iter().position(|byte| *byte == b'=') {
                    Attr {
                        key: value[..eq].to_vec(),
                        value: value[eq + 1..].to_vec(),
                        unspecified: false,
                    }
                } else {
                    Attr {
                        key: value.to_vec(),
                        value: b"true".to_vec(),
                        unspecified: false,
                    }
                }
            })
            .collect();
        if pattern.is_empty() {
            lines.push(Line::Macro(name, attrs));
        } else {
            lines.push(Line::Pattern(wildmatch_pattern(&pattern)?, attrs));
        }
    }
    Some(lines)
}

fn wildmatch_pattern(pattern: &[u8]) -> Option<Vec<u8>> {
    let mut result = Vec::new();
    let mut index = 0;
    while index < pattern.len() {
        if pattern[index] == b'\\' {
            if pattern
                .get(index + 1)
                .is_some_and(|next| b"\\[]*?#".contains(next))
            {
                result.extend_from_slice(&pattern[index..index + 2]);
                index += 2;
            } else {
                result.push(b'/');
                index += 1;
            }
        } else {
            result.push(pattern[index]);
            index += 1;
        }
    }
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        result = go_string(&result)
            .chars()
            .flat_map(|c| c.to_lowercase().take(1))
            .collect::<String>()
            .into_bytes();
    }
    for component in result.split(|byte| *byte == b'/') {
        if !valid_component(component) {
            return None;
        }
    }
    Some(result)
}
// Validate only the syntax that wildmatch v2.0.1 rejects while constructing its
// matcher; matching is unnecessary for track's presentation of source patterns.
fn valid_component(component: &[u8]) -> bool {
    let mut i = 0;
    while i < component.len() {
        match component[i] {
            b'\\' => {
                if i + 1 == component.len() {
                    return false;
                }
                i += 2;
            }
            b'[' => {
                i += 1;
                while i < component.len() {
                    if component[i..].starts_with(b"[:") {
                        let Some(close) = component[i..].windows(2).position(|w| w == b":]") else {
                            return false;
                        };
                        if close == 1 {
                            i += 2;
                            continue;
                        }
                        let class = component[i + 2..i + close].to_ascii_lowercase();
                        if ![
                            b"alnum".as_slice(),
                            b"alpha",
                            b"blank",
                            b"cntrl",
                            b"digit",
                            b"graph",
                            b"lower",
                            b"print",
                            b"punct",
                            b"space",
                            b"upper",
                            b"xdigit",
                        ]
                        .contains(&class.as_slice())
                        {
                            return false;
                        }
                        i += close + 2;
                    } else if component[i] == b'-' || component[i] == b'\\' {
                        if i + 1 == component.len() {
                            return false;
                        }
                        i += 2;
                    } else if component[i] == b']' {
                        i += 1;
                        break;
                    } else {
                        i += 1;
                    }
                }
            }
            _ => i += 1,
        }
    }
    true
}

fn unquote(quoted: &[u8]) -> Option<Vec<u8>> {
    if quoted.len() < 2 || quoted.first() != Some(&b'"') || quoted.last() != Some(&b'"') {
        return None;
    }
    let inner = &quoted[1..quoted.len() - 1];
    let mut result = Vec::new();
    let mut i = 0;
    while i < inner.len() {
        match inner[i] {
            b'"' | b'\n' => return None,
            b'\\' => {
                i += 1;
                let escape = *inner.get(i)?;
                match escape {
                    b'a' => result.push(7),
                    b'b' => result.push(8),
                    b'f' => result.push(12),
                    b'n' => result.push(b'\n'),
                    b'r' => result.push(b'\r'),
                    b't' => result.push(b'\t'),
                    b'v' => result.push(11),
                    b'\\' | b'"' => result.push(escape),
                    b'x' | b'u' | b'U' => {
                        let count = match escape {
                            b'x' => 2,
                            b'u' => 4,
                            _ => 8,
                        };
                        let mut value = 0u32;
                        for byte in inner.get(i + 1..i + 1 + count)? {
                            value = value
                                .checked_mul(16)?
                                .checked_add((*byte as char).to_digit(16)?)?;
                        }
                        if escape == b'x' {
                            result.push(value as u8);
                        } else {
                            result.extend_from_slice(
                                char::from_u32(value)?.encode_utf8(&mut [0; 4]).as_bytes(),
                            );
                        }
                        i += count;
                    }
                    b'0'..=b'7' => {
                        let digits = inner.get(i..i + 3)?;
                        let mut value = 0u16;
                        for byte in digits {
                            if !(b'0'..=b'7').contains(byte) {
                                return None;
                            }
                            value = value * 8 + u16::from(*byte - b'0');
                        }
                        result.push(u8::try_from(value).ok()?);
                        i += 2;
                    }
                    _ => return None,
                }
                i += 1;
            }
            byte if byte < 128 => {
                result.push(byte);
                i += 1;
            }
            _ => {
                let (character, length) = rune(&inner[i..]);
                result.extend_from_slice(character.encode_utf8(&mut [0; 4]).as_bytes());
                i += length;
            }
        }
    }
    Some(result)
}
fn rune(bytes: &[u8]) -> (char, usize) {
    for size in 1..=4.min(bytes.len()) {
        if let Ok(value) = std::str::from_utf8(&bytes[..size])
            && let Some(character) = value.chars().next()
        {
            return (character, size);
        }
    }
    ('\u{fffd}', 1)
}
fn trim_space(mut bytes: &[u8]) -> &[u8] {
    while !bytes.is_empty() {
        let (c, n) = rune(bytes);
        if !c.is_whitespace() {
            break;
        }
        bytes = &bytes[n..];
    }
    while !bytes.is_empty() {
        let mut end = bytes.len() - 1;
        while end > 0 && bytes[end] & 0xc0 == 0x80 {
            end -= 1;
        }
        let (c, n) = rune(&bytes[end..]);
        if end + n != bytes.len() || !c.is_whitespace() {
            break;
        }
        bytes = &bytes[..end];
    }
    bytes
}
fn go_string(bytes: &[u8]) -> String {
    let mut result = String::new();
    let mut position = 0;
    while position < bytes.len() {
        let (character, size) = rune(&bytes[position..]);
        result.push(character);
        position += size;
    }
    result
}
fn is_separator(byte: u8) -> bool {
    byte == b'/' || cfg!(windows) && byte == b'\\'
}
fn slash_native(bytes: &[u8]) -> Vec<u8> {
    bytes
        .iter()
        .map(|b| {
            if cfg!(windows) && *b == b'\\' {
                b'/'
            } else {
                *b
            }
        })
        .collect()
}
fn source_path(root: &Path, file: &Path) -> Vec<u8> {
    let base: Vec<_> = root.components().collect();
    let target: Vec<_> = file.components().collect();
    let shared = base.iter().zip(&target).take_while(|(a, b)| a == b).count();
    let mut result = PathBuf::new();
    for _ in shared..base.len() {
        result.push("..");
    }
    for part in &target[shared..] {
        result.push(part.as_os_str());
    }
    result.as_os_str().as_encoded_bytes().to_vec()
}
fn clean_native(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir if result.file_name().is_some_and(|v| v != OsStr::new("..")) => {
                result.pop();
            }
            _ => result.push(part.as_os_str()),
        }
    }
    if result.as_os_str().is_empty() {
        result.push(".");
    }
    result
}
fn clean_slash(bytes: &[u8]) -> Vec<u8> {
    let rooted = bytes.first() == Some(&b'/');
    let mut parts: Vec<&[u8]> = Vec::new();
    for part in bytes.split(|byte| *byte == b'/') {
        match part {
            b"" | b"." => {}
            b".." if parts.last().is_some_and(|last| *last != b"..") => {
                parts.pop();
            }
            b".." if rooted => {}
            _ => parts.push(part),
        }
    }
    let mut result = if rooted { b"/".to_vec() } else { Vec::new() };
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            result.push(b'/');
        }
        result.extend_from_slice(part);
    }
    if result.is_empty() {
        result.push(b'.');
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parse(value: &[u8], source: &[u8]) -> Vec<Pattern> {
        MacroProcessor::new().parse(value, source, true)
    }
    #[test]
    fn preserves_duplicates_exclusions_and_sticky_lockable() {
        let patterns = parse(b"*.bin filter=lfs lockable -lockable\n*.bin filter=lfs filter=other\n*.dat -filter\n*.x lockable\n", b".gitattributes");
        assert_eq!(patterns.len(), 4);
        assert!(patterns[0].tracked && patterns[0].lockable);
        assert!(!patterns[1].tracked && !patterns[2].tracked && patterns[3].lockable);
        assert_eq!(patterns[0].pattern, patterns[1].pattern);
    }
    #[test]
    fn macros_expand_once_and_unspecified_filter_remains_an_exclusion() {
        let mut processor = MacroProcessor::new();
        assert!(
            processor
                .parse(
                    b"[attr]lfs filter=lfs lockable\n[attr]alias lfs\n",
                    b"",
                    true
                )
                .is_empty()
        );
        let patterns = processor.parse(
            b"a lfs\nb !lfs\nc alias\n[attr]nested filter=lfs\nd nested\n",
            b"sub/.gitattributes",
            false,
        );
        assert_eq!(patterns.len(), 2);
        assert_eq!(patterns[0].pattern, "sub/a");
        assert!(patterns[0].tracked && patterns[0].lockable);
        assert!(!patterns[1].tracked && !patterns[1].lockable);
    }
    #[test]
    fn go_quoted_patterns_and_wildmatch_slash_escaping() {
        let patterns = parse(
            br#""sp ace\t\141\x62\u03bb" filter=lfs
raw\path filter=lfs
literal\* filter=lfs
"#,
            b"deep/.gitattributes",
        );
        assert_eq!(patterns[0].pattern, "deep/sp ace\tabλ");
        assert_eq!(patterns[1].pattern, "deep/raw/path");
        assert_eq!(patterns[2].pattern, "deep/literal\\*");
        assert_eq!(go_string(&[0xf0, 0x90]), "��");
    }
    #[test]
    fn native_parser_drops_whole_invalid_files_and_splits_only_spaces() {
        assert!(parse(b"ok filter=lfs\n\"broken filter=lfs\n", b".gitattributes").is_empty());
        assert!(
            parse(
                b"ok filter=lfs\n[[:unknown:]] filter=lfs\n",
                b".gitattributes"
            )
            .is_empty()
        );
        assert!(parse(b"*.bin\tfilter=lfs\n", b".gitattributes").is_empty());
        assert_eq!(parse(b"[unclosed filter=lfs\n", b".gitattributes").len(), 1);
    }
    #[test]
    fn go_unstable_source_ties_match_native_thirteen_file_oracle() {
        assert_eq!(
            go_source_order(&[1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]),
            vec![9, 1, 3, 5, 7, 11, 2, 4, 6, 8, 0, 10, 12]
        );
    }
    #[test]
    fn local_format_comparison_preserves_native_space_only_trim() {
        assert_eq!(trim_config_output(b" 0 "), b"0");
        assert_eq!(trim_config_output(b"0\n"), b"0");
        assert_eq!(trim_config_output(b"   "), b"");
        assert_eq!(trim_config_output(b"\t0\t"), b"\t0\t");
        assert_eq!(trim_config_output(b"\r0\r"), b"\r0\r");
    }
    #[test]
    fn attribute_reads_are_bounded_and_errors_do_not_echo_source_content() {
        let root = std::env::temp_dir().join(format!(
            "desktop-attributes-budget-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&root).unwrap();
        let file = root.join("private-content-marker");
        fs::write(&file, vec![b'x'; ATTRIBUTE_INSPECTION_BUDGET + 1]).unwrap();
        let mut budget = ATTRIBUTE_INSPECTION_BUDGET;
        let error = read_attributes(&file, false, &mut budget)
            .unwrap_err()
            .to_string();
        assert_eq!(error, "Git attribute content exceeds the inspection limit");
        assert!(!error.contains("private-content-marker"));
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn attribute_fifos_do_not_block_and_regular_symlinks_are_supported() {
        use std::{
            ffi::CString,
            os::unix::fs::symlink,
            time::{Duration, Instant},
        };
        let root =
            std::env::temp_dir().join(format!("desktop-attributes-kind-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let fifo = root.join("pipe");
        let encoded = CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(encoded.as_ptr(), 0o600) }, 0);
        let before = Instant::now();
        let mut budget = ATTRIBUTE_INSPECTION_BUDGET;
        assert!(
            read_attributes(&fifo, false, &mut budget)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            read_attributes(&fifo, true, &mut budget)
                .unwrap_err()
                .to_string(),
            "Global Git attributes must be a regular file"
        );
        assert!(before.elapsed() < Duration::from_secs(2));
        let regular = root.join("regular");
        fs::write(&regular, b"*.bin filter=lfs\n").unwrap();
        let alias = root.join("alias");
        symlink(&regular, &alias).unwrap();
        assert_eq!(
            read_attributes(&alias, true, &mut budget).unwrap().unwrap(),
            b"*.bin filter=lfs\n"
        );
        fs::remove_dir_all(root).unwrap();
    }
    // The recorded native oracle uses Android/Linux path and case semantics.
    // Run the production reader in a child test process so its Git environment
    // is isolated without mutating this test process's environment or HOME.
    #[cfg(any(target_os = "linux", target_os = "android"))]
    mod oracle {
        use super::*;
        use serde_json::{Value, json};
        use std::{
            io::Write,
            process::{Command, Output, Stdio},
        };
        const CHILD_ROOT: &str = "DESKTOP_RS_LFS_ATTRIBUTES_ORACLE_ROOT";
        const FIXTURE: &str = include_str!("../../../tests/lfs-attributes-oracle.json");
        struct Temporary(PathBuf);
        impl Drop for Temporary {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        #[test]
        fn recorded_native_patterns_and_format_versions_are_read_only() {
            let home = std::env::var_os("HOME");
            let directory =
                std::env::temp_dir().join(format!("desktop-lfs-oracle-{}", uuid::Uuid::new_v4()));
            let mut builder = fs::DirBuilder::new();
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&directory).unwrap();
            let _temporary = Temporary(directory.clone());
            fs::create_dir(directory.join("templates")).unwrap();
            let global = directory.join("empty-config");
            fs::write(&global, []).unwrap();
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args([
                    "--exact",
                    "lfs_attributes::tests::oracle::worker",
                    "--ignored",
                    "--nocapture",
                    "--test-threads=1",
                ])
                .env(CHILD_ROOT, &directory)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_GLOBAL", &global)
                .env("GIT_CONFIG_SYSTEM", &global)
                .env("GIT_ATTR_NOSYSTEM", "1")
                .env("GIT_TERMINAL_PROMPT", "0")
                .env("GIT_CONFIG_COUNT", "0")
                .stdin(Stdio::null());
            for (key, _) in std::env::vars_os() {
                let name = key.to_string_lossy();
                if name.starts_with("GIT_CONFIG_KEY_")
                    || name.starts_with("GIT_CONFIG_VALUE_")
                    || matches!(
                        name.as_ref(),
                        "GIT_CONFIG_PARAMETERS"
                            | "GIT_CONFIG"
                            | "GIT_DIR"
                            | "GIT_COMMON_DIR"
                            | "GIT_WORK_TREE"
                            | "GIT_INDEX_FILE"
                            | "GIT_OBJECT_DIRECTORY"
                            | "GIT_ALTERNATE_OBJECT_DIRECTORIES"
                            | "GIT_LITERAL_PATHSPECS"
                            | "GIT_GLOB_PATHSPECS"
                            | "GIT_NOGLOB_PATHSPECS"
                            | "GIT_ICASE_PATHSPECS"
                    )
                {
                    command.env_remove(key);
                }
            }
            let output = command.output().unwrap();
            assert!(
                output.status.success(),
                "native oracle replay failed:\n{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(
                String::from_utf8_lossy(&output.stdout)
                    .contains("34 pattern cases and 18 format cases passed")
            );
            assert_eq!(fs::read(global).unwrap(), b"");
            assert_eq!(std::env::var_os("HOME"), home);
        }
        #[test]
        #[ignore = "isolated worker launched by recorded_native_patterns_and_format_versions_are_read_only"]
        fn worker() {
            let base = PathBuf::from(
                std::env::var_os(CHILD_ROOT).expect("oracle worker requires isolated environment"),
            );
            let home = std::env::var_os("HOME");
            let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            let cases = fixture["cases"].as_array().unwrap();
            for case in cases {
                let name = case["name"].as_str().unwrap();
                let parent = base.join(name);
                fs::create_dir(&parent).unwrap();
                let root = parent.join("root");
                let linked = case["setup"]["linked_worktree"].as_bool().unwrap_or(false);
                let primary = if linked {
                    parent.join("main")
                } else {
                    root.clone()
                };
                initialize(&primary, &base.join("templates"));
                if linked {
                    git(
                        &primary,
                        vec![
                            "worktree".into(),
                            "add".into(),
                            "--quiet".into(),
                            "--orphan".into(),
                            "-b".into(),
                            "oracle-linked".into(),
                            root.clone().into_os_string(),
                        ],
                        None,
                    );
                }
                let common = primary.join(".git");
                for file in case["files"].as_array().unwrap() {
                    let path = expand(&decode_field(file, "path"), &root, &common);
                    let path = PathBuf::from(os_from_bytes(&path).unwrap());
                    fs::create_dir_all(path.parent().unwrap()).unwrap();
                    let mut content = decode_field(file, "content");
                    if file["expand_placeholders"].as_bool().unwrap_or(false) {
                        content = expand(&content, &root, &common);
                    }
                    fs::write(path, content).unwrap();
                }
                for (key, value) in case["config"].as_object().unwrap() {
                    git(
                        &root,
                        vec![
                            "config".into(),
                            "--local".into(),
                            key.into(),
                            os_from_bytes(&expand(
                                value.as_str().unwrap().as_bytes(),
                                &root,
                                &common,
                            ))
                            .unwrap(),
                        ],
                        None,
                    );
                }
                // Exclude only the explicitly authored fixture ignore files.
                let excludes = parent.join("empty-excludes");
                fs::write(&excludes, []).unwrap();
                git(
                    &root,
                    vec![
                        "config".into(),
                        "--local".into(),
                        "core.excludesfile".into(),
                        excludes.into_os_string(),
                    ],
                    None,
                );
                for file in case["files"].as_array().unwrap() {
                    if file["tracked"].as_bool().unwrap_or(false) {
                        git(
                            &root,
                            vec![
                                "--literal-pathspecs".into(),
                                "add".into(),
                                "--force".into(),
                                "--".into(),
                                os_from_bytes(&expand(&decode_field(file, "path"), &root, &common))
                                    .unwrap(),
                            ],
                            None,
                        );
                    }
                }
                for path in case["setup"]["remove_working"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    fs::remove_file(PathBuf::from(
                        os_from_bytes(&expand(path.as_str().unwrap().as_bytes(), &root, &common))
                            .unwrap(),
                    ))
                    .unwrap();
                }
                for path in case["setup"]["remove_index"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    git(
                        &root,
                        vec![
                            "--literal-pathspecs".into(),
                            "update-index".into(),
                            "--force-remove".into(),
                            "--".into(),
                            os_from_bytes(&expand(
                                path.as_str().unwrap().as_bytes(),
                                &root,
                                &common,
                            ))
                            .unwrap(),
                        ],
                        None,
                    );
                }
                for key in case["setup"]["unset_config"]
                    .as_array()
                    .into_iter()
                    .flatten()
                {
                    git(
                        &root,
                        vec![
                            "config".into(),
                            "--local".into(),
                            "--unset-all".into(),
                            key.as_str().unwrap().into(),
                        ],
                        None,
                    );
                }
                if case["setup"]["conflict_index"].as_bool().unwrap_or(false) {
                    let blob = git(
                        &root,
                        args(&["hash-object", "-w", "--stdin"]),
                        Some(b"fixture conflict blob\n"),
                    );
                    let oid = std::str::from_utf8(&blob.stdout).unwrap().trim();
                    let mut index = String::new();
                    for stage in 1..=3 {
                        index.push_str(&format!("100644 {oid} {stage}\t.gitattributes\n"));
                    }
                    git(
                        &root,
                        args(&["update-index", "--index-info"]),
                        Some(index.as_bytes()),
                    );
                }
                let before = snapshot(&parent);
                let actual = runtime
                    .block_on(async {
                        let repository = Repository::open(&root).await?;
                        inspect(&repository).await
                    })
                    .unwrap_or_else(|error| panic!("{name}: {error}"));
                assert_eq!(
                    normalize(json!(actual), &root, &common),
                    case["expected"]["patterns"],
                    "pattern oracle case {name}"
                );
                assert_eq!(
                    snapshot(&parent),
                    before,
                    "inspection changed fixture {name}"
                );
                println!("pattern {name}: passed");
            }
            let versions = fixture["version_cases"].as_array().unwrap();
            for case in versions {
                let name = case["name"].as_str().unwrap();
                let parent = base.join(format!("version-{name}"));
                fs::create_dir(&parent).unwrap();
                let root = parent.join("root");
                initialize(&root, &base.join("templates"));
                let global = parent.join("empty-attributes");
                fs::write(&global, []).unwrap();
                git(
                    &root,
                    vec![
                        "config".into(),
                        "--local".into(),
                        "core.attributesfile".into(),
                        global.into_os_string(),
                    ],
                    None,
                );
                for value in case["config_before"].as_array().unwrap() {
                    git(
                        &root,
                        vec![
                            "config".into(),
                            "--local".into(),
                            "--add".into(),
                            "lfs.repositoryformatversion".into(),
                            value.as_str().unwrap().into(),
                        ],
                        None,
                    );
                }
                let before = snapshot(&parent);
                let result = runtime.block_on(async {
                    let repository = Repository::open(&root).await?;
                    inspect(&repository).await
                });
                assert_eq!(
                    result.is_ok(),
                    case["code"] == 0,
                    "format oracle case {name}: {result:?}"
                );
                if let Ok(patterns) = result {
                    assert_eq!(
                        json!({"patterns":patterns}),
                        case["stdout_json"],
                        "format case {name}"
                    );
                }
                assert_eq!(
                    snapshot(&parent),
                    before,
                    "inspection changed format fixture {name}"
                );
                println!("format {name}: passed");
            }
            assert_eq!(cases.len(), 34);
            assert_eq!(versions.len(), 18);
            assert_eq!(std::env::var_os("HOME"), home);
            println!("34 pattern cases and 18 format cases passed");
        }
        fn initialize(root: &Path, templates: &Path) {
            fs::create_dir(root).unwrap();
            let mut template = OsString::from("--template=");
            template.push(templates);
            git(
                root,
                vec![
                    "init".into(),
                    "--quiet".into(),
                    "--object-format=sha1".into(),
                    "--initial-branch=main".into(),
                    template,
                ],
                None,
            );
        }
        fn git(root: &Path, args: Vec<OsString>, input: Option<&[u8]>) -> Output {
            let mut child = Command::new("git")
                .args(args)
                .current_dir(root)
                .stdin(if input.is_some() {
                    Stdio::piped()
                } else {
                    Stdio::null()
                })
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            if let Some(input) = input {
                child.stdin.take().unwrap().write_all(input).unwrap();
            }
            let output = child.wait_with_output().unwrap();
            assert!(
                output.status.success(),
                "fixture Git command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            output
        }
        fn decode_field(file: &Value, field: &str) -> Vec<u8> {
            if let Some(value) = file[field].as_str() {
                return value.as_bytes().to_vec();
            }
            let hex = file[format!("{field}_hex")].as_str().unwrap();
            hex.as_bytes()
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
                .collect()
        }
        fn expand(value: &[u8], root: &Path, common: &Path) -> Vec<u8> {
            let mut result = value.to_vec();
            for (marker, path) in [(b"COMMON".as_slice(), common), (b"ROOT".as_slice(), root)] {
                let mut expanded = Vec::new();
                let mut position = 0;
                while position < result.len() {
                    if result[position..].starts_with(marker) {
                        expanded.extend_from_slice(path.as_os_str().as_encoded_bytes());
                        position += marker.len();
                    } else {
                        expanded.push(result[position]);
                        position += 1;
                    }
                }
                result = expanded;
            }
            result
        }
        fn normalize(value: Value, root: &Path, common: &Path) -> Value {
            match value {
                Value::String(value) => Value::String(
                    value
                        .replace(&go_string(common.as_os_str().as_encoded_bytes()), "COMMON")
                        .replace(&go_string(root.as_os_str().as_encoded_bytes()), "ROOT"),
                ),
                Value::Array(values) => Value::Array(
                    values
                        .into_iter()
                        .map(|v| normalize(v, root, common))
                        .collect(),
                ),
                Value::Object(values) => Value::Object(
                    values
                        .into_iter()
                        .map(|(k, v)| (k, normalize(v, root, common)))
                        .collect(),
                ),
                other => other,
            }
        }
        fn snapshot(root: &Path) -> Vec<(PathBuf, Option<Vec<u8>>)> {
            fn walk(path: &Path, values: &mut Vec<(PathBuf, Option<Vec<u8>>)>) {
                for entry in fs::read_dir(path).unwrap() {
                    let entry = entry.unwrap();
                    let path = entry.path();
                    if entry.file_type().unwrap().is_dir() {
                        values.push((path.clone(), None));
                        walk(&path, values);
                    } else {
                        values.push((path.clone(), Some(fs::read(path).unwrap())));
                    }
                }
            }
            let mut result = Vec::new();
            walk(root, &mut result);
            result.sort_by(|a, b| a.0.cmp(&b.0));
            result
        }
    }
    #[test]
    fn shared_output_budget_bounds_short_rows_with_long_sources() {
        let mut processor = MacroProcessor::new();
        let source = format!("{}private-marker/.gitattributes", "long/".repeat(128));
        let body = b"x filter=lfs\n".repeat(2000);
        let error = processor
            .parse_with_budget(
                &body,
                source.as_bytes(),
                true,
                &mut OutputBudget {
                    remaining: ATTRIBUTE_INSPECTION_BUDGET,
                },
            )
            .unwrap_err()
            .to_string();
        assert_eq!(error, "Git attribute output exceeds the inspection limit");
        assert!(!error.contains("private-marker"));
        let mut exposed = OutputBudget { remaining: 200 };
        assert_eq!(
            processor
                .parse_with_budget(b"x filter=lfs\n", b".gitattributes", true, &mut exposed)
                .unwrap()
                .len(),
            1
        );
        assert!(
            processor
                .parse_with_budget(b"x filter=lfs\n", b".gitattributes", true, &mut exposed)
                .is_err()
        );
    }
}
