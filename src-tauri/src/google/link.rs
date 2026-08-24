use thiserror::Error;
use url::Url;

#[derive(Debug, Error)]
pub enum DriveLinkError {
    #[error("Google Drive link or file ID is empty")]
    Empty,
    #[error("link must use drive.google.com or docs.google.com")]
    UnsupportedHost,
    #[error("Google Drive link does not contain a valid file ID")]
    MissingFileId,
}

pub fn parse_drive_file_id(input: &str) -> Result<String, DriveLinkError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(DriveLinkError::Empty);
    }
    if is_valid_id(input) {
        return Ok(input.to_owned());
    }

    let url = Url::parse(input).map_err(|_| DriveLinkError::MissingFileId)?;
    if url.scheme() != "https" {
        return Err(DriveLinkError::UnsupportedHost);
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if !matches!(
        host.as_str(),
        "drive.google.com" | "docs.google.com" | "drive.usercontent.google.com"
    ) {
        return Err(DriveLinkError::UnsupportedHost);
    }

    if let Some(id) = url
        .query_pairs()
        .find_map(|(name, value)| (name == "id" && is_valid_id(&value)).then(|| value.into_owned()))
    {
        return Ok(id);
    }

    let segments: Vec<_> = url.path_segments().into_iter().flatten().collect();
    if let Some(index) = segments.iter().position(|segment| *segment == "d") {
        if let Some(id) = segments.get(index + 1).filter(|value| is_valid_id(value)) {
            return Ok((*id).to_owned());
        }
    }

    Err(DriveLinkError::MissingFileId)
}

fn is_valid_id(value: &str) -> bool {
    (10..=256).contains(&value.len())
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "1AbCd_efGh-123456789";

    #[test]
    fn accepts_raw_id_and_common_drive_links() {
        assert_eq!(parse_drive_file_id(ID).unwrap(), ID);
        assert_eq!(
            parse_drive_file_id(&format!(
                "https://drive.google.com/file/d/{ID}/view?usp=sharing"
            ))
            .unwrap(),
            ID
        );
        assert_eq!(
            parse_drive_file_id(&format!("https://drive.google.com/open?id={ID}")).unwrap(),
            ID
        );
        assert_eq!(
            parse_drive_file_id(&format!("https://docs.google.com/document/d/{ID}/edit")).unwrap(),
            ID
        );
    }

    #[test]
    fn rejects_untrusted_hosts_and_malformed_ids() {
        assert!(matches!(
            parse_drive_file_id(&format!("https://evil.example/file/d/{ID}")),
            Err(DriveLinkError::UnsupportedHost)
        ));
        assert!(parse_drive_file_id("short").is_err());
    }
}
