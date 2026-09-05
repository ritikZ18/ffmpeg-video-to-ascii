use std::env; 
use std::process::Command; 

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

    let output = Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-i",
                video_path,
                "-vf",
                &scale,
                "-frames:v",
                "1",
                "-pix_fmt",
                "rgb24",
                "-f",
                "rawvideo",
                "pipe:1",

            ])
            .output()
            .expect("failed to start ffmpeg");

        if !output.status.success(){ 
                eprintln!("FFmpeg failed:");

                eprintln!("{}", String::from_utf8_lossy(&output.stderr));

                std::process::exit(1);
        }

        let frame = output.stdout ; 
        println!("Recieved RGB bytes : {}", frame.len());

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

        let idx = (center_x * WIDTH + center_x) * CHANNELS ; 

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
