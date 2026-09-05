This is the repo for the making the video conversion using FFmpeg and shared worker to convert that 
frames into terminal ASCII

--> we will use the 
    1. Rust lang ( to learn and use Video Pipeline to render pixels --> glyphs )
    2. FFMPEG as decoder 
    3. renderer with 24-bit terminal colors 
    4. not printing the character one by one 
        --> Reason : thosands of terminal write per frame will kill performance 
        --> frame -> build -> one write.all() -> flush()
        --> and we will not clear terminal frame 

                                    input.mp4
                                        │
                                        ▼
                                    read terminal dimensions
                                        │
                                        ▼
                                    cols × rows*2
                                        │
                                        ▼
                                    FFmpeg
                                        │
                                        ├── preserve aspect ratio
                                        ├── scale
                                        ├── RGB24
                                        └── source-rate pacing
                                            │
                                            ▼
                                        RGB frame
                                            │
                                        ┌─────┴─────┐
                                        │           │
                                    top RGB     bottom RGB
                                        │           │
                                    foreground background
                                        └─────┬─────┘
                                            ▼
                                            ▀
                                            │
                                            ▼
                                    truecolor terminal
