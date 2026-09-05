use std::env; 
use std::io::{BufReader, Read, Write };
use std::process::{Command,Stdio}; 

use crossterm::{event::{self, Event, KeyCode}, terminal, } ; 
use std::time::Duration;

// const WIDTH : usize = 80 ;  crossterm take full width of terminal 
// const HEIGHT : usize = 45 ; 
const CHANNELS : usize = 3 ; 

// now real game begin 
// const ASCII_CHARS : &[u8] = b" .:-=+*#%@";
const ASCII_CHARS : &[u8] = b" .,:;irsXA253hMHGS#9B&@";

// FAST NASI HELPER 
fn push_u8_number(output: &mut Vec<u8>, value: u8) {
    if value >= 100 {
        output.push(b'0' + value / 100);
        output.push(b'0' + (value % 100) / 10);
        output.push(b'0' + value % 10);
    } else if value >= 10 {
        output.push(b'0' + value / 10);
        output.push(b'0' + value % 10);
    } else {
        output.push(b'0' + value);
    }
}

fn push_fg_color(
    output: &mut Vec<u8>,
    r: u8,
    g: u8,
    b: u8,
) {
    output.extend_from_slice(b"\x1b[38;2;");
    push_u8_number(output, r);
    output.push(b';');
    push_u8_number(output, g);
    output.push(b';');
    push_u8_number(output, b);
    output.push(b'm');
}

fn push_bg_color(
    output: &mut Vec<u8>,
    r: u8,
    g: u8,
    b: u8,
) {
    output.extend_from_slice(b"\x1b[48;2;");
    push_u8_number(output, r);
    output.push(b';');
    push_u8_number(output, g);
    output.push(b';');
    push_u8_number(output, b);
    output.push(b'm');
}

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
    
    let mut output = Vec::with_capacity(width * height * 12 );

     // remember previous color to avoid repeating ANSI
    let mut last_r: i16 = -1;
    let mut last_g: i16 = -1;
    let mut last_b: i16 = -1;

    for y in (0..height).step_by(2) { 
        for x in 0..width { 
            let idx = ( y * width + x) * CHANNELS ;

            let top_r = frame[idx] as u32 ;
            let top_g = frame[idx + 1 ] as u32 ;
            let top_b = frame[idx + 2 ] as u32 ;

            // btm pixels 
            let bottom_y = if y + 1 < height { 
                y + 1 
            } else { y }; 

            let bottom_idx = (bottom_y * width + x ) * CHANNELS;
            let bottom_r = frame[bottom_idx] as u32;
            let bottom_g = frame[bottom_idx + 1 ] as u32;
            let bottom_b = frame[bottom_idx + 2 ] as u32;

            // average 2 vertical pixels
            let r = ((top_r + bottom_r) / 2) as u8;
            let g = ((top_g + bottom_g) / 2) as u8;
            let b = ((top_b + bottom_b) / 2) as u8;



            // rgb -> brightness
            let brightness = (2126 * r as u32 + 7152 * g  as u32 + 722 * b as u32) / 10000 ;

            // small contrast boost (optional)
            let brightness = if brightness > 128 {
                128 + ((brightness - 128) * 115 / 100)
            } else {
                128 - ((128 - brightness) * 115 / 100)
            };

            let brightness = brightness.min(255);


            // brightness -> ascii 
            let char_index = brightness as usize * ( ASCII_CHARS.len() - 1 ) / 255 ; 
            // let ascii_char = ASCII_CHARS[char_index] as char ; 
            let ascii_char = ASCII_CHARS[char_index] ; 
            // output.push(ASCII_CHARS[char_index]);

            // spaces do not need a color escape
            if ascii_char == b' ' {
                output.push(b' ');
                continue;
            }


            // only emit RGB escape when color changed
            if last_r != r as i16
                || last_g != g as i16
                || last_b != b as i16
            {
                push_fg_color(
                        &mut output,
                        r,
                        g,
                        b,
                    );

                last_r = r as i16;
                last_g = g as i16;
                last_b = b as i16;
            }


            // ACTUAL ASCII CHARACTER
            output.push(ascii_char);
        }
        // output.push(b'\n');
        output.extend_from_slice(b"\x1b[0m");
        if y + 2 < height {
            output.extend_from_slice(b"\r\n");
        }
        last_r = -1;
        last_g = -1;
        last_b = -1;
    }

    // reset terminal color 4
    output
}


fn frame_to_block(
    frame: &[u8],
    width: usize,
    height: usize,
) -> Vec<u8> {

    let mut output = Vec::with_capacity(width * height * 15);

    for y in (0..height).step_by(2) {

        for x in 0..width {

            // top pixel
            let idx = (y * width + x) * CHANNELS;

            let r = frame[idx];
            let g = frame[idx + 1];
            let b = frame[idx + 2];


            // bottom pixel
            let bottom_y = if y + 1 < height {
                y + 1
            } else {
                y
            };

            let bottom_idx =
                (bottom_y * width + x) * CHANNELS;

            let bottom_r = frame[bottom_idx];
            let bottom_g = frame[bottom_idx + 1];
            let bottom_b = frame[bottom_idx + 2];


            write!(
                &mut output,
                "\x1b[38;2;{};{};{}m\x1b[48;2;{};{};{}m▀",
                r,
                g,
                b,
                bottom_r,
                bottom_g,
                bottom_b
            )
            .unwrap();
        }

       output.extend_from_slice(b"\x1b[0m");

            if y + 2 < height {
                output.extend_from_slice(b"\r\n");
            }
    }

    output
}


fn main() {

    // println!("Hello, world!");
    let args: Vec<String> = env::args().collect();

   if args.len() < 2 {
    eprintln!("Usage:");
    eprintln!("cargo run --release -- <video>");
    eprintln!("cargo run --release -- <video> --mode ascii");
    eprintln!("cargo run --release -- <video> --mode block");
    eprintln!("cargo run --release -- <video> --mode ascii --audio");
    std::process::exit(1);
}

let video_path = &args[1];

let mut mode = "ascii";
let mut audio = false;

let mut i = 2;

while i < args.len() {
    match args[i].as_str() {
        "--mode" => {
            if i + 1 >= args.len() {
                eprintln!("Missing value after --mode");
                std::process::exit(1);
            }

            mode = args[i + 1].as_str();
            i += 2;
        }

        "--audio" => {
            audio = true;
            i += 1;
        }

        value => {
            eprintln!("Unknown option: {value}");
            std::process::exit(1);
        }
    }
}

if mode != "ascii" && mode != "block" {
    eprintln!("Invalid mode: {mode}");
    eprintln!("Use ascii or block");
    std::process::exit(1);
}




  // default mode = ascii
    let mode = if args.len() == 4 {

        if args[2] != "--mode" {
            eprintln!("Expected --mode");
            std::process::exit(1);
        }

        args[3].as_str()

    } else {
        "ascii"
    };


    if mode != "ascii" && mode != "block" {

        eprintln!("Invalid mode: {mode}");
        eprintln!("Use ascii or block");

        std::process::exit(1);
    }

     let (cols, rows) = terminal::size() .unwrap_or((80,24));
    let width = cols.saturating_sub(1) as usize;
     let terminal_rows = rows.saturating_sub(1) as usize;
     let height  = terminal_rows * 2 ; 


     let expected_size = width * height  * CHANNELS ;

    println!("Input video: {video_path}");
    println!("Requested frame: {width}x{height}");
    println!("Expected RGB bytes: {expected_size}");

// let scale = format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}");
let scale = format!(
    "scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,\
pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black"
);

// audio output 
let mut audio_output = if audio {

        match Command::new("ffplay")
            .args([
                "-nodisp",
                "-autoexit",
                "-loglevel",
                "quiet",
                "-vn",
                video_path,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => Some(child),

            Err(error) => {

                eprintln!(
                    "Audio disabled: could not start ffplay: {error}"
                );

                None
            }
        }

    } else {

        None
    };


    // new implementation : for continuos frame render .spawn()
    let mut output = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-nostdin",
                "-re",  // real video
                "-i",
                video_path,
                "-an",
                "-sn",
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
        
        
        let mut reader = BufReader::with_capacity(expected_size *2, stdout,);

        // strict allocation 1 frame buffer ourselve ( to avoid rx vec<u8> from output.stdout)
        // reuse the same memory from each frame 
        let mut frame = vec![0u8; expected_size]; 
        // println!("Recieved RGB bytes : {}", frame.len());

     
        // tracking complete video framed recieved 
        let mut frame_number : usize = 0 ; 
        let mut user_quit = false;
        // terminal printer init 
        let stdout_terminal  = std::io::stdout();
        let mut terminal = stdout_terminal.lock();
        
        crossterm::terminal::enable_raw_mode().expect("failed to enable raw cmode");
       write!(
        terminal,
        "\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l"
        ).unwrap();
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

                                   

                                user_quit = true;

                                let _ = output.kill();

                                if let Some(audio_output) =
                                    audio_output.as_mut()
                                {
                                    let _ =
                                        audio_output.kill();
                                }

                                break;
                                }

                                _ => {}
                            }
                        }
                    }
                  let ascii = match mode {

                    "block" => {
                        frame_to_block(
                            &frame,
                            width,
                            height,
                        )
                    }

                    _ => {
                        frame_to_ascii(
                            &frame,
                            width,
                            height,
                        )
                    }
                };

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
       write!(
    terminal,
    "\x1b[0m\x1b[?25h\x1b[?1049l"
    ).unwrap();
        terminal.flush().unwrap();
        drop(terminal);
        crossterm::terminal::disable_raw_mode().expect("failed to disable raw mode");

    // cleanupp audio 
          if let Some(audio_output) =
        audio_output.as_mut()
    {
        let _ = audio_output.kill();
        let _ = audio_output.wait();
    }

        // Ffmpeg is at the end 
        let status = output 
            .wait()
            .expect("failed waiting of ffmpeg");
        
        if !status.success() && !user_quit { 
            eprintln!("ffmpeg failed status: {status}");
            std::process::exit(1);
        }

     println!("FFmpeg exited with: {status}");
    println!("Total frames received: {frame_number}");

}
