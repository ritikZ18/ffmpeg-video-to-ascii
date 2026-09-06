// we will use this as adhoc to main.rs to serve web terminal interface 
use axum::{ 
    routing::{get, get_service}, Router,
}; 
use tokio::net::TcpListener;
use std::env;
use tower_http::services::{ServeDir, ServeFile};

async fn health() -> &'static str { "RUST//FRAME Onlline"}

#[tokio::main]
async fn main(){ 
    let port = env::var("PORT")
    .unwrap_or_else(|_| "3000".into())
    .parse::<u16>()
    .expect("PORT must be number");

    let app = Router::new()
        .route("/health", get(health))

        // browser accessible originall video+auido
        .route_service(
            "/assets/input.mp4",
            get_service(ServeFile::new("input.mp4")),
        )
        .fallback_service(ServeDir::new("web"));

    let listener = TcpListener::bind(("0.0.0.0", port))
            .await
            .expect("failed to bind server");
    
    println!("RUST//FRAME listin on http://localhost:{port}");

    axum::serve(listener, app)
        .await
        .expect("server crashed");
}

