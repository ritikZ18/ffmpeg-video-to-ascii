use std::env; 
use std::io::{BufReader, Read};
use std::process::{Command,Stdio}; 

const WIDTH : usize = 80 ; 
const HEIGHT : usize = 45 ; 
const CHANNELS : usize = 3 ; 

fn main() {

    // println!("Hello, world!");
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        eprintln!("Usage:");
        eprintln!(" cargon --run -- <video> ");
        std::process::exit(1);
     }


     let video_path = &args[1];
     let expected_size = WIDTH * HEIGHT * CHANNELS ;

    println!("Input video: {video_path}");
    println!("Requested frame: {WIDTH}x{HEIGHT}");
    println!("Expected RGB bytes: {expected_size}");

    let scale = format!("scale={WIDTH}:{HEIGHT}");

    // new implementation : for continuos frame render .spawn()
    let mut output = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-i",
                video_path,
                "-vf",
                &scale,
                // removing the below, to see everyframe in video
                // "-frames:v",
                // "1",
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

        // if !output.status.success(){ 
        //         eprintln!("FFmpeg failed:");

        //         eprintln!("{}", String::from_utf8_lossy(&output.stderr));

        //         std::process::exit(1);
        // }

        // we will capture all ffmpeg raw bytes to out implementation in rust 
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
        loop { 


            match reader.read_exact(&mut frame){ 
                Ok(_) => { 
                    frame_number += 1 ;
                    if frame_number == 1 {

                    println!("Recieved RGB bytes : {}", frame.len());

                    // for frame == 1. check what we recieved compared to expected RGB 

                    println!("recieved RGB bytes : {}", frame.len()); 
                       if frame.len() != expected_size { 
                            eprintln!(
                                "ERROR : expected {} bytes but reoieved {}",
                                expected_size,
                                frame.len()
                            );
                            std::process::exit(1);
                        }
                        println!("Frame size verification : PASSED ") ; 


                    // render first pixel 
                    let r = frame[0];
                    let g = frame[1];
                    let b = frame[2];
                    
                    println!("First pixel:");
                    println!("  R = {r}");
                    println!("  G = {g}");
                    println!("  B = {b}");

                    // center pixel 
                    let center_x = WIDTH / 2 ; 
                    let center_y = HEIGHT / 2 ; 

                    let idx = (center_y * WIDTH + center_x) * CHANNELS ; 

                    let r = frame[idx];
                    let g = frame[idx + 1];
                    let b = frame[idx + 2];

                    println!();
                    println!("Center pixel ({center_x}, {center_y}):");
                    println!("  R = {r}");
                    println!("  G = {g}");
                    println!("  B = {b}");

                    println!();
                    println!("FFmpeg -> Rust RGB frame pipeline works.");


                }

                // we every 30 frames print current  center pixel 
                if frame_number % 30 == 0 { 
                   
                    let center_x = WIDTH / 2 ; 
                    let center_y = HEIGHT / 2 ; 


                    let idx = ( center_y * WIDTH + center_x) * CHANNELS ; 

                    let r = frame[idx];
                    let g = frame[idx + 1];
                    let b = frame[idx + 2];

                    println!(
                        "Frame {:6} | center RGB = ({:3}, {:3}, {:3})",
                        frame_number,
                        r,
                        g,
                        b
                    );
                }
            }

                Err(error) => { 

                    if error.kind() == std::io::ErrorKind:: UnexpectedEof{ 
                        println!();
                        println!("Video Finish");
                        break;
                    }

                    break ; 
                }
            }
        }


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
