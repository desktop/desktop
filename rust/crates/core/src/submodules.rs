//! Structured submodule state without parsing newline-delimited porcelain paths.
use crate::{GitPath, Repository, args, process, validate_path};
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};

impl Repository {
    pub(crate) async fn submodules(&self) -> Result<Value> {
        if !self.path.join(".gitmodules").exists() {
            return Ok(json!([]));
        }
        let output = self
            .run(&args(&[
                "config",
                "--file",
                ".gitmodules",
                "--null",
                "--get-regexp",
                "^submodule\\..*\\.path$",
            ]))
            .await?;
        if !matches!(output.code, 0 | 1) {
            bail!("{}", output.text().stderr);
        }
        let mut modules = Vec::new();
        for record in output
            .stdout
            .split(|b| *b == 0)
            .filter(|record| !record.is_empty())
        {
            let split = record
                .iter()
                .position(|b| *b == b'\n')
                .context("malformed submodule config")?;
            let key = std::str::from_utf8(&record[..split])?;
            let name = key
                .strip_prefix("submodule.")
                .and_then(|key| key.strip_suffix(".path"))
                .context("invalid submodule key")?;
            let path = validate_path(GitPath::Bytes {
                bytes: record[split + 1..].to_vec(),
            })?;
            let url = self
                .run(&args(&[
                    "config",
                    "--file",
                    ".gitmodules",
                    "--get",
                    &format!("submodule.{name}.url"),
                ]))
                .await?;
            let mut listed = args(&["ls-files", "--stage", "-z", "--"]);
            listed.push(path.clone());
            let listed = self.run(&listed).await?;
            if listed.code != 0 {
                bail!("{}", listed.text().stderr);
            }
            let mut index_oid = None;
            for entry in listed
                .stdout
                .split(|b| *b == 0)
                .filter(|entry| !entry.is_empty())
            {
                if let Some(tab) = entry.iter().position(|b| *b == b'\t') {
                    if &entry[tab + 1..] != path.as_encoded_bytes() {
                        continue;
                    }
                    let metadata = std::str::from_utf8(&entry[..tab])?;
                    let fields: Vec<_> = metadata.split_whitespace().collect();
                    if fields.len() == 3 && fields[0] == "160000" && fields[2] == "0" {
                        index_oid = Some(fields[1].to_owned());
                    }
                }
            }
            let mut directory = self.path.clone();
            for component in std::path::Path::new(&path).components() {
                directory.push(component.as_os_str());
                if std::fs::symlink_metadata(&directory)
                    .is_ok_and(|value| value.file_type().is_symlink())
                {
                    bail!("submodule path traverses a symbolic link");
                }
            }
            let mut head = None;
            let mut dirty = false;
            // Do not let Git accidentally discover the parent repository in an uninitialized directory.
            if directory.join(".git").exists() {
                let tip =
                    process::run(&directory, &args(&["rev-parse", "--verify", "HEAD"])).await?;
                if tip.code == 0 {
                    head = Some(String::from_utf8(tip.stdout)?.trim().to_owned());
                }
                let status =
                    process::run(&directory, &args(&["status", "--porcelain=v1", "-z"])).await?;
                if status.code != 0 {
                    bail!("{}", status.text().stderr);
                }
                dirty = !status.stdout.is_empty();
            }
            modules.push(json!({"name":name,"path":GitPath::Bytes{bytes:path.as_encoded_bytes().to_vec()},"display_path":path.to_string_lossy(),"url":(url.code==0).then(||url.text().stdout.trim_end_matches('\n').to_owned()),"index_oid":index_oid,"head":head,"initialized":head.is_some(),"changed":head.is_some()&&head!=index_oid,"dirty":dirty}));
        }
        Ok(Value::Array(modules))
    }
    pub(crate) async fn submodule_command(
        &self,
        action: &str,
        paths: Vec<GitPath>,
        recursive: bool,
        force: bool,
    ) -> Result<Value> {
        let mut command = args(&["submodule", action]);
        if action == "update" {
            command.push("--init".into());
        }
        if recursive {
            command.push("--recursive".into());
        }
        if force {
            command.push("--force".into());
        }
        if action == "deinit" && paths.is_empty() {
            bail!("select at least one submodule to deinitialize");
        }
        command.push("--".into());
        for path in paths {
            command.push(validate_path(path)?);
        }
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }
    pub(crate) async fn submodule_add(
        &self,
        url: String,
        path: GitPath,
        name: Option<String>,
    ) -> Result<Value> {
        if url.is_empty()
            || url.starts_with('-')
            || url.contains(['\0', '\n', '\r'])
            || url.starts_with("ext::")
        {
            bail!("invalid submodule URL");
        }
        let mut command = args(&["submodule", "add"]);
        if let Some(name) = name {
            if name.is_empty() || name.starts_with('-') || name.contains(['\0', '\n', '\r']) {
                bail!("invalid submodule name");
            }
            command.extend(args(&["--name", &name]));
        }
        command.extend(args(&["--", &url]));
        command.push(validate_path(path)?);
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }
}
