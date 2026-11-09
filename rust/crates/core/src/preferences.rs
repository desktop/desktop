use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    pub version: u32,
    pub theme: Theme,
    pub poll_interval_ms: u64,
    #[serde(default)]
    pub external_editor: crate::ExternalEditor,
    #[serde(default)]
    pub uncommitted_changes: crate::ChangesStrategy,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            theme: Theme::System,
            poll_interval_ms: 2000,
            external_editor: crate::ExternalEditor::default(),
            uncommitted_changes: crate::ChangesStrategy::default(),
        }
    }
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreferencesPatch {
    pub theme: Option<Theme>,
    pub poll_interval_ms: Option<u64>,
    pub external_editor: Option<crate::ExternalEditor>,
    pub uncommitted_changes: Option<crate::ChangesStrategy>,
}
#[derive(Clone)]
pub struct PreferencesStore {
    path: PathBuf,
}
impl PreferencesStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
    pub fn read(&self) -> Result<Preferences> {
        let value = match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .context("read preferences; existing data was not overwritten")?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Preferences::default(),
            Err(error) => return Err(error.into()),
        };
        validate(&value)?;
        Ok(value)
    }
    pub fn update(&self, patch: PreferencesPatch) -> Result<Preferences> {
        crate::storage::update(
            &self.path,
            || self.read(),
            |value| {
                if let Some(theme) = patch.theme {
                    value.theme = theme;
                }
                if let Some(interval) = patch.poll_interval_ms {
                    value.poll_interval_ms = interval;
                }
                if let Some(editor) = patch.external_editor {
                    value.external_editor = editor;
                }
                if let Some(strategy) = patch.uncommitted_changes {
                    value.uncommitted_changes = strategy;
                }
                validate(value)
            },
        )
    }
}
fn validate(value: &Preferences) -> Result<()> {
    if value.version != 1 {
        bail!("unsupported preferences version");
    }
    if !(500..=60000).contains(&value.poll_interval_ms) {
        bail!("poll_interval_ms must be between 500 and 60000");
    }
    value.external_editor.validate()?;
    Ok(())
}
