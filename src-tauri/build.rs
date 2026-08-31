fn main() {
    let _ = dotenvy::from_filename("../.env")
        .or_else(|_| dotenvy::from_filename(".env"))
        .or_else(|_| dotenvy::dotenv());

    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-changed=.env");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");

    if let Ok(client_id) = std::env::var("GOOGLE_CLIENT_ID") {
        let trimmed = client_id.trim();
        if !trimmed.is_empty() {
            println!("cargo:rustc-env=GOOGLE_CLIENT_ID={trimmed}");
        }
    }

    if let Ok(client_secret) = std::env::var("GOOGLE_CLIENT_SECRET") {
        let trimmed = client_secret.trim();
        if !trimmed.is_empty() {
            println!("cargo:rustc-env=GOOGLE_CLIENT_SECRET={trimmed}");
        }
    }

    tauri_build::build();
}
