// we will use this as adhoc to main.rs to serve web terminal interface 
mod terminal_process ; 
use axum::{ 
    extract::{
    Query,
    ws::{ 
        Message,
        WebSocket, 
        WebSocketUpgrade,
    },
    },
    response::Response,
    routing::get, Router,

}; 
use serde::Deserialize;
use tokio::net::TcpListener;
use terminal_process::TerminalProcess; 
use std::env;
use tower_http::services::{ServeDir, ServeFile};

async fn health() -> &'static str { "RUST//FRAME Onlline"}


#[derive(Debug, Deserialize)]
struct TerminalSize {
    cols: u16,
    rows: u16,
}

async fn ws_handler(
    Query(size): Query<TerminalSize>,
    ws: WebSocketUpgrade,
) -> Response {

    // Prevent insane browser/client supplied sizes.
    let cols =
        size.cols.clamp(60, 180);

    let rows =
        size.rows.clamp(20, 58);


    println!(
        "WS terminal requested: {}x{}",
        cols,
        rows
    );


    ws.on_upgrade(move |socket| {
        handle_terminal(
            socket,
            cols,
            rows,
        )
    })
}

async fn handle_terminal(
    mut socket: WebSocket, cols: u16, rows: u16,
) {
    println!("Browser connected");

    // Temporary fixed size.

    println!("Starting MAINFRAME PTY: {}x{}", cols,rows);
    // Browser resize comes later.
    let mut process = match TerminalProcess::spawn(
        "ascii",
        cols,
        rows,
    ) {
        Ok(process) => process,

        Err(error) => {
            eprintln!(
                "Could not start mainframe: {error:#}"
            );

            let _ = socket
                .send(Message::Text(
                    "MAINFRAME START FAILURE"
                        .into()
                ))
                .await;

            return;
        }
    };

    while let Some(data) =
        process.output.recv().await
    {
        if socket
            .send(
                Message::Binary(
                    data.into()
                )
            )
            .await
            .is_err()
        {
            println!("Browser disconnected");
            break;
        }
    }

    process.kill();

    println!("Session closed");
}


#[tokio::main]
async fn main(){ 
    let port = env::var("PORT")
    .unwrap_or_else(|_| "3000".into())
    .parse::<u16>()
    .expect("PORT must be number");

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_handler))
        // browser accessible originall video+auido
        .route_service(
            "/assets/input.mp4",
            ServeFile::new("input.mp4"),
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

