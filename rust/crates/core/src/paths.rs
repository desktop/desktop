//! Native directory paths in persistent metadata and RPCs, preserving Unix bytes.
use crate::GitPath;
use anyhow::{Result, bail};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::path::PathBuf;

pub fn directory_path(path: GitPath) -> Result<PathBuf> {
    let value = match path {
        GitPath::Text(value) => value.into(),
        GitPath::Bytes { bytes } => crate::os_from_bytes(&bytes)?,
    };
    let path = PathBuf::from(value);
    if path.as_os_str().is_empty() || path.as_os_str().as_encoded_bytes().contains(&0) {
        bail!("invalid directory path");
    }
    Ok(path)
}
#[derive(Clone)]
struct SavedPath(PathBuf);
impl Serialize for SavedPath {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if let Some(value) = self.0.to_str() {
            serializer.serialize_str(value)
        } else {
            GitPath::Bytes {
                bytes: self.0.as_os_str().as_encoded_bytes().to_vec(),
            }
            .serialize(serializer)
        }
    }
}
impl<'de> Deserialize<'de> for SavedPath {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        directory_path(GitPath::deserialize(deserializer)?)
            .map(Self)
            .map_err(serde::de::Error::custom)
    }
}
pub(crate) mod list {
    use super::*;
    pub fn serialize<S: Serializer>(value: &[PathBuf], s: S) -> Result<S::Ok, S::Error> {
        value
            .iter()
            .cloned()
            .map(SavedPath)
            .collect::<Vec<_>>()
            .serialize(s)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<PathBuf>, D::Error> {
        Ok(Vec::<SavedPath>::deserialize(d)?
            .into_iter()
            .map(|value| value.0)
            .collect())
    }
}
pub(crate) mod optional {
    use super::*;
    pub fn serialize<S: Serializer>(value: &Option<PathBuf>, s: S) -> Result<S::Ok, S::Error> {
        value.clone().map(SavedPath).serialize(s)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<PathBuf>, D::Error> {
        Ok(Option::<SavedPath>::deserialize(d)?.map(|value| value.0))
    }
}
