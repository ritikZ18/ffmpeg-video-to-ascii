use anyhow::{bail, Context, Result};

use portable_pty::{
    native_pty_system,
    ChildKiller,
    CommandBuilder,
    PtySize,
    PtySystem,
};
use std::{io::Read, path::PathBuf,};
use tokio::sync::mpsc;

pub struct TerminalProcess {
    pub output: mpsc::Receiver<Vec<u8>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

impl TerminalProcess {
    pub fn spawn(
        mode: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Self> {

         // Cargo project root:
        // ~/development/ui-ux/ffmpeg-terminal
        let project_root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR"));


        let mainframe_path =
            project_root
                .join("target")
                .join("release")
                .join("ffmpeg-terminal");


        let video_path =
            project_root.join("input.mp4");


        println!(
            "Launching mainframe: {}",
            mainframe_path.display()
        );


        if !mainframe_path.exists() {
            bail!(
                "mainframe binary missing: {}",
                mainframe_path.display()
            );
        }


        if !video_path.exists() {
            bail!(
                "video missing: {}",
                video_path.display()
            );
        }


        let pty_system = native_pty_system();

        // This becomes terminal::size() inside main.rs
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to create PTY")?;

          let mut cmd =
            CommandBuilder::new(
                mainframe_path.as_os_str()
            );
            
        cmd.cwd(project_root.as_os_str());
        cmd.arg(video_path.as_os_str());

        cmd.arg("--mode");
        cmd.arg(mode);

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .context("failed to launch mainframe")?;

        // Allows server to kill mainframe if browser leaves
        let killer = child.clone_killer();

        // main.rs stdout now comes through this reader
        let mut reader = pair
            .master
            .try_clone_reader()
            .context("failed to open PTY reader")?;

        // Important after spawning child
        drop(pair.slave);

        let (tx, rx) =
            mpsc::channel::<Vec<u8>>(8);

        std::thread::spawn(move || {
            let mut buffer = vec![0u8; 64 * 1024];

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,

                    Ok(count) => {
                        let data =
                            buffer[..count].to_vec();

                        if tx.blocking_send(data).is_err() {
                            break;
                        }
                    }

                    Err(error) => {
                        eprintln!(
                            "PTY read error: {error}"
                        );
                        break;
                    }
                }
            }

            let _ = child.wait();

            println!("Mainframe exited");
        });

        Ok(Self {
            output: rx,
            killer,
        })
    }

    pub fn kill(&mut self) {
        let _ = self.killer.kill();
    }
}