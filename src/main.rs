use std::env; 
use std::io::{BufReader, Read, Write };
use std::process::{Command,Stdio}; 

use crossterm::{event::{self, Event, KeyCode}, terminal, } ; 
use std::time::Duration;

// const WIDTH : usize = 80 ;  crossterm take full width of terminal 
// const HEIGHT : usize = 45 ; 
const CHANNELS : usize = 3 ; 

// now real game begin 
const ASCII_CHARS : &[u8] = b" .:-=+*#%@";

// terminal printer 
// --> FLOW <---
//          R G B
//           ↓
//          brightness 0..255
//           ↓
//          ASCII index
//           ↓
//          " .:-=+*#%@"

fn frame_to_ascii(frame: &[u8], width: usize, height: usize ) -> Vec<u8> { 
    
    let mut output = Vec::with_capacity(width * height * 20 );

    for y in (0..height).step_by(2) { 
        for x in 0..width { 
            let idx = ( y * width + x) * CHANNELS ;

            let r = frame[idx] as u32 ;
            let g = frame[idx + 1 ] as u32 ;
            let b = frame[idx + 2 ] as u32 ;

            // btm pixels 
            let bottom_y = if y + 1 < height { 
                y + 1 
            } else { y }; 

            let bottom_idx = (bottom_y * width + x ) * CHANNELS;
            let bottom_r = frame[bottom_idx];
            let bottom_g = frame[bottom_idx + 1 ];
            let bottom_b = frame[bottom_idx + 2 ];

            // // rgb -> brightness
            // let brightness = (2126 * r + 7152 * g + 722 * b) / 10000 ;

            // // brightness -> ascii 
            // let char_index = brightness as usize * ( ASCII_CHARS.len() - 1 ) / 255 ; 
            // let ascii_char = ASCII_CHARS[char_index] as char ; 
            // // output.push(ASCII_CHARS[char_index]);

            

            write!(
                &mut output ,
                  "\x1b[38;2;{};{};{}m\x1b[48;2;{};{};{}m▀",
                r,g,b,
                bottom_r, bottom_g , bottom_b
            ).unwrap();
        }
        // output.push(b'\n');
        output.extend_from_slice(b"\x1b[0m\n");
    }

    // reset terminal color 4
    output
}



fn main() {

    // println!("Hello, world!");
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        eprintln!("Usage:");
        eprintln!(" cargon --run -- <video> ");
        std::process::exit(1);
     }


     let video_path = &args[1];
     let (cols, rows) = terminal::size() .unwrap_or((80,24));
     let width = cols as usize ; 
     let height  = rows.saturating_sub(1) as usize * 2 ; 


     let expected_size = width * height  * CHANNELS ;

    println!("Input video: {video_path}");
    println!("Requested frame: {width}x{height}");
    println!("Expected RGB bytes: {expected_size}");

   let scale = format!( "scale={width}:{height}:force_original_aspect_ratio=decrease, pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"
    );

    // new implementation : for continuos frame render .spawn()
    let mut output = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-re",  // real video
                "-i",
                video_path,
                "-vf",
                &scale,
                "-pix_fmt",
                "rgb24",
                "-f",
                "rawvideo",
                "pipe:1",

            ])
            .stdout(Stdio::piped())
            // error in terminal 
            .stderr(Stdio::inherit())
            .spawn()
            .expect("failed to start ffmpeg");

    
        let stdout  = output 
            .stdout
            .take()
            .expect("failed to open ffmpeg stdout ");
        
        
        let mut reader = BufReader::new(stdout);

        // strict allocation 1 frame buffer ourselve ( to avoid rx vec<u8> from output.stdout)
        // reuse the same memory from each frame 
        let mut frame = vec![0u8; expected_size]; 
        // println!("Recieved RGB bytes : {}", frame.len());

     
        // tracking complete video framed recieved 
        let mut frame_number : usize = 0 ; 
        // terminal printer init 
        let stdout_terminal  = std::io::stdout();
        let mut terminal = stdout_terminal.lock();
        
        crossterm::terminal::enable_raw_mode().expect("failed to enable raw cmode");
        write!(terminal, "\x1b[2J\x1b[H\x1b[?25l").unwrap();
        terminal.flush().unwrap();

        loop { 


            match reader.read_exact(&mut frame){ 
                Ok(_) => { 
                    frame_number += 1 ; 

                    // check keyboard without blocking video playback
                    if event::poll(Duration::from_millis(0)).unwrap() {

                        if let Event::Key(key) = event::read().unwrap() {

                            match key.code {

                                // q quits playback
                                KeyCode::Char('q') => {

                                    output.kill()
                                        .expect("failed to stop ffmpeg");

                                    break;
                                }

                                _ => {}
                            }
                        }
                    }
                    let ascii = frame_to_ascii(&frame, width, height) ; 

                    // move cursor to top left 
                    write!(terminal, "\x1b[H").unwrap(); 

                    // draw complete frame 
                    terminal.write_all(&ascii).unwrap();
                    terminal.flush().unwrap();

            }

                Err(error) => { 

                    if error.kind() == std::io::ErrorKind:: UnexpectedEof{ 
                        println!();
                        println!("Video Finish");
                        break;
                    }


                    // restore terminal before printing error
                    write!(
                        terminal,
                        "\x1b[0m\x1b[?25h\x1b[?1049l"
                    )
                    .unwrap();

                    terminal.flush().unwrap();

                    drop(terminal);


                    eprintln!(
                        "Error reading FFmpeg output: {error}"
                    );

                    std::process::exit(1);
                }
            }
        }

        // restore terminal 
        write!(terminal,"\x1b[0m\x1b[?25\x1b[?1049l").unwrap();
        terminal.flush().unwrap();
        drop(terminal);
        crossterm::terminal::disable_raw_mode().expect("failed to disable raw mode");


        // Ffmpeg is at the end 
        let status = output 
            .wait()
            .expect("failed waiting of ffmpeg");
        
        if !status.success(){ 
            eprintln!("ffmpeg failed status: {status}");
            std::process::exit(1);
        }

     println!("FFmpeg exited with: {status}");
    println!("Total frames received: {frame_number}");

}
