const major = Number(process.versions.node.split(".")[0]);
if (major < 16) {
  console.error("❌ Node.js v16+ required. Found:", process.versions.node);
  process.exit(1);
}

const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();
const WebSocket = require("ws")
const http = require("http");
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
const { spawn, exec , execSync } = require("child_process");


function detectSdCard(callback) {
  exec("lsblk -o NAME,TYPE,MOUNTPOINT", (error, stdout, stderr) => {
   if (error || !stdout) {
      console.error("detectSdCard lsblk error:", error);
      return callback(null);
    }

    const lines = stdout.split("\n");

    for (const line of lines) {
      // Look for mmc block device partition
      if (line.includes("mmc") && line.includes("/media")) {
        const parts = line.trim().split(/\s+/);
        const mountPoint = parts[parts.length - 1];

        return callback(mountPoint);
      }
    }

    callback(null); // SD not found
  });
}


function detectUsbCamera(callback) {

  exec("ls /dev/video*", (err, stdout) => {
    if (err || !stdout) return callback(null);

    exec("v4l2-ctl --list-devices", (err2, out) => {
      if (err2 || !out) return callback(null);

      const match = out.match(/\/dev\/video\d+/);
      callback(match ? match[0] : null);
    });
  });
}

function GET_DATE_TIME_FORMATED() {
  const now = new Date();

  const pad = n => String(n).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_` +
         `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

 
function GET_DATE_FORMATED() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
let  sdMountPoint = null;
let videosDir = null;
detectSdCard(mount => {
  if (!mount) {
    console.error("❌ SD CARD NOT DETECTED");
  } else {
    console.log("✅ SD CARD DETECTED AT POINT:", mount);
    //const videosDir = path.join(__dirname, "videos", GET_DATE_FORMATED());
    videosDir = path.join(mount, "videos", GET_DATE_FORMATED());
    app.use("/videos", express.static(path.join(mount, "videos")));
    

    sdMountPoint = mount;
    if (!fs.existsSync(videosDir)){
    console.log("RECORDING FILE PATH NOT EXIST:", videosDir);
    fs.mkdirSync(videosDir, { recursive: true });
     }
}
});


app.get("/", (req, res) => {
     console.log("/index.html request recieve");
   res.sendFile(path.join(__dirname, "public", "index.html"));
});

// function getUniqueFilePath(dir, baseName, ext) {
//   let filePath = path.join(dir, `${baseName}${ext}`);
//   let counter = 1;
//   while (fs.existsSync(filePath)){
//     filePath = path.join(dir, `${baseName}_${counter}${ext}`);
//     counter++;
//   }
//   return filePath;
// }
function getUniqueFilePath(dir, baseName, ext){
  //  strip any directory from basename
  baseName = path.basename(baseName, path.extname(baseName));

  //  normalize extension
  ext = ext.startsWith(".") ? ext : `.${ext}`;

  let counter = 0;
  let filePath;

  do {
    const suffix = counter === 0 ? "" : `_${counter}`;
    filePath = path.join(dir, `${baseName}${suffix}${ext}`);
    counter++;
  } while (fs.existsSync(filePath));

  return filePath;
}


let ffmpegProcess = null;
//let CAMERA_CONFIGURATION_CAP = {};
let CAMERA_CONFIGURATION = {
   
   format: "h264", // mjpeg | yuyv | h264
   resolution: "1920x1080",
   fps: 30, //5,15,30,50,60
   DEVICE_NODE: "/dev/video0",
   width: 1280,
   height: 720, 
   EXTENSION: ".mkv"      // mkv | mp4
};


let CAMERA_CONFIGURATION_CAP = {
  formats: ["MJPEG", "YUYV", "H264"],
  resolutions: ["320x240","480x272","424x240","640x360","640x480","720x480","800x448","800x600","1024x576","1024x768","1280x720","1920x1080","2560x1440"],
  fps: [10,15,20,24,25,30,50,60]
};

// function CAMERA_CONFIGURATION_CAPABILITIES(videoDev, callback){
//   //v4l2-ctl -d /dev/video0 --list-formats-ext
//   exec(`v4l2-ctl -d /dev/video0 --list-formats-ext`, (err, stdout) => {
//  // exec(`v4l2-ctl -d ${videoDev} --list-formats-ext`, (err, stdout) => {
//     if (err) {
//       console.error("Failed to read camera formats:", err);
//       return callback(null);
//     }

//     const capabilities = {};
//     let currentFormat = null;
//     let currentResolution = null;

//     const lines = stdout.split("\n");

//     for (const line of lines) {
//       // Pixel format line → [1]: 'MJPG'
//       const formatMatch = line.match(/\[\d+\]:\s+'(\w+)'/);
//       if (formatMatch) {
//         currentFormat = formatMatch[1];
//         capabilities[currentFormat] = {};
//         continue;
//       }

//       // Resolution line → Size: Discrete 1280x720
//       const sizeMatch = line.match(/Size:\s+Discrete\s+(\d+x\d+)/);
//       if (sizeMatch && currentFormat) {
//         currentResolution = sizeMatch[1];
//         capabilities[currentFormat][currentResolution] = [];
//         continue;
//       }

//       // FPS line → Interval: Discrete 0.033s (30.000 fps)
//       const fpsMatch = line.match(/\(([\d.]+)\s+fps\)/);
//       if (fpsMatch && currentFormat && currentResolution) {
//         const fps = parseFloat(fpsMatch[1]);
//         capabilities[currentFormat][currentResolution].push(fps);
//       }
//     }

//     callback(capabilities);
//   });
// }



// detectUsbCamera(videoDev => {
//   if (!videoDev) {
//     console.error("No USB camera detected at startup");
//     return;
//   }

//   cameraDevice = videoDev;

//   CAMERA_CONFIGURATION_CAPABILITIES(videoDev, caps => {
//     if (!caps) {
//       console.error("Failed to load camera capabilities");
//       return;
//     }

//     //cameraCapabilities = caps;

//    // console.log("Camera capabilities loaded:",cameraCapabilities);
//    // console.dir(cameraCapabilities, { depth: null });
//   });
// });


app.get("/api/camera/config", (req, res) => {
console.log("GET CAMERA CONFIGURATION  REQUEST:");
  if (!CAMERA_CONFIGURATION_CAP) {
     console.error("GET CAMERA CONFIGURATION  REQUEST ERROR:" ,CAMERA_CONFIGURATION_CAP);
     return res.status(500).json({ error: "CONFIGURATION SETTING FAILED"}); }
 
  res.json({
    current: CAMERA_CONFIGURATION,
    capabilities: CAMERA_CONFIGURATION_CAP
  });
});

app.post("/api/camera/config", (req, res) => {
  let { format, resolution, fps } = req.body;
  console.log("POST CAMERA CONFIGURATION:", req.body);

  if (!format || !resolution || !fps) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // normalize
  format = format.toUpperCase();
  fps = Number(fps);

  if (!CAMERA_CONFIGURATION_CAP.formats.includes(format)) {
    return res.status(400).json({ error: "Invalid format" });
  }

  if (!CAMERA_CONFIGURATION_CAP.resolutions.includes(resolution)) {
    return res.status(400).json({ error: "Invalid resolution" });
  }

  if (!CAMERA_CONFIGURATION_CAP.fps.includes(fps)) {
    return res.status(400).json({ error: "Invalid FPS" });
  }

  // derive width/height
  const [width, height] = resolution.split("x").map(Number);

  // ✅ THIS IS THE IMPORTANT PART
  CAMERA_CONFIGURATION = {
    ...CAMERA_CONFIGURATION,   // keep device node, extension
    format,
    resolution,
    fps,
    width,
    height,
    //EXTENSION: format === "H264" ? ".mp4" : ".mkv"
  };

  console.log("UPDATED CAMERA CONFIG:", CAMERA_CONFIGURATION);

  res.json({
    message: "CONFIGURATION_SAVED",
    current: CAMERA_CONFIGURATION
  });
});



const liveClients = new Set(); 
let LIVE_STREAM_ENABLED = true;
let WESOCKET_CONNECTED_FLAG= false;

let RECORDING_STATE = {
  status : "IDLE",
  active: false,
  paused: false,
  filename: null,
  FINAL_FILE_PATH: null,
  
  startTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  segments: [], 
  curr_segment: null
};
 
const FFMPEG_ERROR = {
  OK: 0,
  SPAWN_FAILED: 1,
  DEVICE_BUSY: 2,
  INVALID_ARGUMENT: 3,
  PROCESS_EXITED: 4,
  UNKNOWN: 99
};

app.get("/api/recording/status", (req, res) => {
  res.json({
    status: RECORDING_STATE.status,
    active: RECORDING_STATE.active,
    paused: RECORDING_STATE.paused,
    filename: RECORDING_STATE.filename,
    startTime: RECORDING_STATE.startTime,
    pausedAt: RECORDING_STATE.pausedAt,
    totalPausedMs: RECORDING_STATE.totalPausedMs
  });
   console.log("HOME PAGE STATE REQUEST ", res.json );
});


function getNextSegmentPath(baseFilename) {
  const index = RECORDING_STATE.segments.length + 1;
  const name = `${baseFilename}_part${index}`;
  return getUniqueFilePath(videosDir, name, CAMERA_CONFIGURATION.EXTENSION);
}


//function FFMPEG_ARGUMENT_COMMAND(outputPath){

// console.log("START CAMERA CONFIGURATION :", CAMERA_CONFIGURATION);
// //`${CAMERA_CONFIGURATION.width}x${CAMERA_CONFIGURATION.height}`,
//   return [
//     "-f", "v4l2",
//     "-input_format", "h264",//String(CAMERA_CONFIGURATION.format).toLowerCase(),
//     "-video_size", String(CAMERA_CONFIGURATION.resolution).toLowerCase(), 
//     "-framerate", String(CAMERA_CONFIGURATION.fps),
//     "-i", CAMERA_CONFIGURATION.DEVICE_NODE,
//     "-c:v", "copy",
//     outputPath
//   ];
// }

function getTeeTargets() {
  const live =
    "[f=mp4:movflags=frag_keyframe+empty_moov+default_base_moof:frag_duration=100000]pipe:1";

  if (!RECORDING_STATE.active) {
    return live;
  }

  const segment = getNextSegmentPath(RECORDING_STATE.filename);
  RECORDING_STATE.segments.push(segment);

  const record =
    `[f=mp4:movflags=+faststart]${segment}`;

  return `${record}|${live}`;
}

// async function stopFFmpeg(reason = "UNKNOWN") {
  
//   if (ffmpegProcess == null && RECORDING_STATE.active ) return;
//   console.log(`🧹 STOPPING FFMPEG (${reason})`);

//      try {
//     ffmpegProcess.kill("SIGINT");
//   } catch (e) {
//     console.warn("⚠️ FFmpeg already dead");
//   }

//   await new Promise(resolve => {
//     ffmpegProcess.once("close", code => {
//       console.log(`🧹 FFMPEG CLOSED: ${code}`);
//       resolve();
//     });
//   });

 // ffmpegProcess.kill("SIGINT");
 // await new Promise(resolve => { ffmpegProcess.once("close", code => { console.log(`🧹 FFMPEG CLOSED: ${code}`);resolve(); }); });

  // 🔑 CRITICAL: let kernel release /dev/video0
   // await new Promise(r => setTimeout(r, 500));
   //  ffmpegProcess = null;
//}


let ffmpegStopping = false;


let lastStopTs = 0;

const MIN_STOP_INTERVAL_MS = 1500;   // ⏱ no double stop spam
const DEVICE_RELEASE_DELAY_MS = 1200;

async function stopFFmpeg(reason = "UNKNOWN") {

  const now = Date.now();

  // ❌ no process
  if (!ffmpegProcess) {
    console.log(`⛔ STOP IGNORED (NO FFMPEG) : ${reason}`);
    return;
  }

  // ❌ already stopping
  if (ffmpegStopping) {
    console.log(`⏳ STOP IGNORED (ALREADY STOPPING) : ${reason}`);
    return;
  }

  // ❌ stop called too soon
  if (now - lastStopTs < MIN_STOP_INTERVAL_MS) {
    console.log(`⏱ STOP IGNORED (TOO FAST) : ${reason}`);
    return;
  }

  // 🔒 lock
  ffmpegStopping = true;
  lastStopTs = now;

  console.log(`🧹 STOPPING FFMPEG (${reason})`);

  try {
    ffmpegProcess.kill("SIGINT");
  } catch (e) {
    console.warn("⚠️ FFmpeg already dead");
  }

  // 🧠 wait for close ONCE
  await new Promise(resolve => {
    ffmpegProcess.once("close", code => {
      console.log(`🧹 FFMPEG CLOSED: ${code}`);
      resolve();
    });
  });

  // 🔑 absolutely required for /dev/video0
  await new Promise(r => setTimeout(r, DEVICE_RELEASE_DELAY_MS));

  // 🧼 cleanup
 // ffmpegProcess = null;
 // ffmpegStopping = false;

  console.log("✅ FFMPEG FULLY STOPPED");
}

// async function stopFFmpeg(reason = "UNKNOWN") {

//     if (!ffmpegProcess || ffmpegStopping) {
//     console.log(`FAILED TO STOPPING FFMPEG (${reason})`); 
//      return; }

//   ffmpegStopping = true;
//   console.log(`🧹 STOPPING FFMPEG (${reason})`);

//   try {
//     ffmpegProcess.kill("SIGINT");
//   } catch (e) {
//     console.warn("⚠️ FFmpeg already dead");
//   }

//   await new Promise(resolve => {
//     ffmpegProcess.once("close", code => {
//       console.log(`🧹 FFMPEG CLOSED: ${code}`);
//       resolve();
//     });
//   });

//   // 🔑 CRITICAL: fully release camera device
//   await new Promise(r => setTimeout(r, 2000));

// }

function isCameraDeviceError(msg) {
  return (
    msg.includes("Device or resource busy") ||
    msg.includes("No such device") ||
    msg.includes("Invalid argument") ||
    msg.includes("Could not open video device")
  );
}

function RUN_FFMPEG_ARGUMENT_COMMAND({ outputPath = null, enableLive = false }){


  if (ffmpegProcess  || ffmpegStopping ) {
    return { success: false, errorId: FFMPEG_ERROR.SPAWN_FAILED, reason: "FFMPEG_ALREADY_RUNNING" };
  }

  let args = [
    "-loglevel", "error",

    "-f", "v4l2",
    "-input_format", "h264",
    "-video_size", CAMERA_CONFIGURATION.resolution,
    "-framerate", String(CAMERA_CONFIGURATION.fps),
    "-i", CAMERA_CONFIGURATION.DEVICE_NODE,

    "-map", "0:v",
     "-c:v", "copy",
    // 🔑 SAFE MP4 OUTPUT
    // "-c:v", "libx264",
    // "-preset", "veryfast",
    // "-tune", "zerolatency",
    // "-pix_fmt", "yuv420p",
    // "-reset_timestamps", "1"
  ];

  // 🎥 OUTPUT MODE
  if (enableLive && outputPath){
      console.log("✅ FFMPEG  enableLive && outputPath");
    args.push(
      "-f", "tee",
      `[f=mp4:movflags=+faststart]${outputPath}|` + `[f=mp4:movflags=frag_keyframe+empty_moov+default_base_moof:frag_duration=100000]pipe:1`
    );
  }else if (enableLive){
   console.log("✅ FFMPEG  enableLive ONLY ");
    args.push(
      "-f", "mp4",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
       "-frag_duration", "100000",   // 100ms fragments
      "pipe:1"
    );
  }else if (outputPath){
    console.log("✅ FFMPEG  outputPath ONLY");
    args.push(
      "-f", "mp4",
      "-movflags", "+faststart",
      outputPath
    );
  }
  
  else {
    return { success: false, errorId: FFMPEG_ERROR.INVALID_ARGUMENT, reason: "NO_OUTPUT_DEFINED" };
  }

  // 🚀 SPAWN
  try {
    ffmpegProcess = spawn("ffmpeg", args);
  } catch (err) {
    return { success: false, errorId: FFMPEG_ERROR.SPAWN_FAILED, reason: err.message };
  }

  let started = false;

  // 📡 LIVE STREAM
  if (enableLive && WESOCKET_CONNECTED_FLAG){

    ffmpegProcess.stdout.on("data", chunk => {
            liveClients.forEach(ws => {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      });
    });
  }

  // ❌ STDERR ANALYSIS
  ffmpegProcess.stderr.on("data", data => {

    const msg = data.toString();
    console.error("FFMPEG stderr OUTPUT :", msg);
     
      if (isCameraDeviceError(msg)) {
    console.error("🚨 CAMERA DEVICE ERROR DETECTED");

    // 🔒 Prevent multiple kills
    if (!ffmpegStopping) {
       stopFFmpeg("🚨 CAMERA DEVICE ERROR");
    }

    // 🔔 Notify system state (important)
   // LAST_FFMPEG_ERROR = {
     // type: "CAMERA_DEVICE",
     // message: msg,
    //  time: Date.now()
   // };

    // ❗ DO NOT restart immediately here
    // Let caller / WS / REST decide
  }

  //  if (msg.includes("Device or resource busy") || msg.includes("No such device") || msg.includes("INVALID_ARGUMENT") ) {
      // stopFFmpeg("🛑Device or resource busy KILL FFMPEG");
       // return { success: false, errorId: FFMPEG_ERROR.OK , reason:"Device error  or resource busy"};
     // }
   
  });

  // ✅ CONFIRM START
  ffmpegProcess.once("spawn", () => {
    started = true;
    console.log("✅ FFMPEG STARTED CORRECTLY");
  });

  // 🛑 EXIT
  ffmpegProcess.on("exit", code => {
    console.warn("⚠️ FFMPEG EXITED:", code);
  });

  // 🧹 CLOSE
  ffmpegProcess.on("close", code => {
    console.warn("🧹 FFMPEG CLOSED:", code);
    //if(code == 255 || code == null){
     ffmpegProcess = null;
    ffmpegStopping = false; 
//}
    // 🧠 IMPORTANT: let kernel release /dev/video0
     new Promise(r => setTimeout(r, 300));
  });

  

  return { success: true, errorId: FFMPEG_ERROR.OK };
}

// function FFMPEG_ARGUMENT_COMMAND(Path){

// // console.log("START CAMERA CONFIGURATION :", CAMERA_CONFIGURATION);

// if(WESOCKET_CONNECTED_FLAG && LIVE_STREAM_ENABLED){

// Path =  Path.replace(/\.mkv$/i, ".mp4");

// return [
//     "-loglevel", "error",
//     "-f", "v4l2",
//     "-input_format", "h264",
//     "-video_size", CAMERA_CONFIGURATION.resolution,
//     "-framerate", String(CAMERA_CONFIGURATION.fps),
//     "-i", CAMERA_CONFIGURATION.DEVICE_NODE,
//     // Split output
//     "-map", "0:v",
//     "-c:v", "copy",
//     "-f", "tee",
//     `[f=mp4:movflags=+faststart]${Path}|[f=mp4:movflags=frag_keyframe+empty_moov+default_base_moof]pipe:1`
//   ];

// }else{

// return [
//     "-f", "v4l2",
//     "-input_format", "h264",//String(CAMERA_CONFIGURATION.format).toLowerCase(),
//     "-video_size", String(CAMERA_CONFIGURATION.resolution).toLowerCase(), 
//     "-framerate", String(CAMERA_CONFIGURATION.fps),
//     "-i", CAMERA_CONFIGURATION.DEVICE_NODE,
//     "-c:v", "copy",
//     Path
//   ];

//    }

// }


// async function stopCurrentFFmpeg(reason = "UNKNOWN") {
  
//   if(!ffmpegProcess) return;

//   console.log(`🧹 Stopping FFmpeg safely (${reason})`);

//   return new Promise(resolve => {
//     try {

//       ffmpegProcess.removeAllListeners();
//       ffmpegProcess.once("close", () => {
//         console.log("✅ FFmpeg stopped cleanly");
//         ffmpegProcess = null;
//         resolve();
//       });

//       ffmpegProcess.kill("SIGINT");
    
//     }catch(e){
//       console.error("FFmpeg force cleanup:", e.message);
//       ffmpegProcess = null;
//       resolve();
//     }
//   });
// }

function notifyLiveClientsReset() {
  liveClients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "RESET_STREAM" }));
    }
  });
}

function detectSdCardAsync() {
  return new Promise(resolve => {
    detectSdCard(mount => resolve(mount));
  });
}

function detectUsbCameraAsync() {
  return new Promise(resolve => {
    detectUsbCamera(dev => resolve(dev));
  });
}
app.post("/start", async (req, res) => {
  console.log("/start request receive");

  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "INVALID_REQUEST_BODY" });
    }

    if (RECORDING_STATE.active) {
      return res.status(400).json({ error: "RECORDING_ALREADY_RUNNING" });
    }

    const { filename } = req.body;

    // 🔍 Hardware checks (NOW REAL async)
    const sdMount = await detectSdCardAsync();
    if (!sdMount) {
      return res.status(400).json({ error: "SD_CARD_NOT_DETECTED" });
    }

    const videoDev = await detectUsbCameraAsync();
    if (!videoDev) {
      return res.status(400).json({ error: "HD_CAMERA_NOT_DETECTED" });
    }

 

    // 🧠 Filename logic
    const FILE_NAME_TEMP = typeof filename === "string" && filename.trim() ? filename.trim() : `video_${GET_DATE_TIME_FORMATED()}`;
    // 🔁 Restart FFmpeg if live-only is running

    if (ffmpegProcess) {
     await stopFFmpeg("🧹 Restarting FFmpeg for recording");
    }

 if (ffmpegProcess == null) {

    // 📁 Paths
    RECORDING_STATE.segments = [];

    const outputPath = getUniqueFilePath(
      videosDir,
      FILE_NAME_TEMP,
      CAMERA_CONFIGURATION.EXTENSION
    );

    const segmentPath = getNextSegmentPath(FILE_NAME_TEMP);
    currentRecordingMp4 = outputPath.replace(/\.mkv$/i, ".mp4");

    console.log("FINAL segment path:", segmentPath);
    console.log("FINAL mp4 path:", currentRecordingMp4);

    // ▶ Start FFmpeg
    const result = RUN_FFMPEG_ARGUMENT_COMMAND({
      enableLive: LIVE_STREAM_ENABLED,
      outputPath: segmentPath
    });

    if (!result.success) {
      console.error("❌ FFMPEG FAILED:", result);
      return res.status(500).json({
        error: "CAMERA_START_FAILED",
        reason: result.reason
      });
    }

    // ✅ Update state AFTER FFmpeg success
    RECORDING_STATE.curr_segment = segmentPath;
    RECORDING_STATE.segments.push(segmentPath);
    RECORDING_STATE.status = "RECORDING";
    RECORDING_STATE.filename = FILE_NAME_TEMP;
    RECORDING_STATE.FINAL_FILE_PATH = currentRecordingMp4;
    RECORDING_STATE.active = true;
    RECORDING_STATE.startTime = Date.now();
    RECORDING_STATE.paused = false;
    RECORDING_STATE.pausedAt = null;
    RECORDING_STATE.totalPausedMs = 0;
     notifyLiveClientsReset();
  }else{    
    return res.status(500).json({ error: "CAMERA_ERROR" });

  }
    return res.json({
      success: true,
      filename: RECORDING_STATE.filename,
      state: RECORDING_STATE.status,
      RECORDING_STATE :RECORDING_STATE,
      CAM_CONFIG : null
    });

  } catch (err) {
    console.error("START_FAILED:", err);
    return res.status(500).json({ error: "START_FAILED" });
  }
});



// app.post("/pause", (req, res) => {

//     console.log("⏸ PAUSE request RECIEVE");
  
//     if (!ffmpegProcess || !RECORDING_STATE.active) {
//     return res.status(400).json({ error: "NO_ACTIVE_RECORDING"});
//   }

//   if (RECORDING_STATE.paused) {
//     return res.status(400).json({ error: "ALREADY_PAUSED" });
//   }

//   try {
//     RECORDING_STATE.paused = true;
//     RECORDING_STATE.pausedAt = Date.now();
//     RECORDING_STATE.totalPausedMs  = 0 ;
//     //ffmpegProcess.kill("SIGSTOP"); // ⏸ HARD PAUSE
    
//   ffmpegProcess.kill("SIGINT"); // ✅ CLEAN STOP
//   ffmpegProcess = null;
  
    
//     console.log("⏸ RECORDING PAUSED");0
//     res.json({ success: true, state: "PAUSED" });
//   } catch (err) {
//     console.error("PAUSE FAILED:", err);
//     res.status(500).json({ error: "PAUSE_FAILED" });
//   }
// });

app.post("/pause", async (req, res) => {
  console.log("⏸ PAUSE request received");

  if (!RECORDING_STATE.active || RECORDING_STATE.paused) {
    return res.status(400).json({ error: "INVALID_STATE" });
  }

  try {

    RECORDING_STATE.paused = true;
    RECORDING_STATE.pausedAt = Date.now(); // ✅ freeze timer
    RECORDING_STATE.status = "PAUSED";


        if (ffmpegProcess) {
        await stopFFmpeg("⛔PAUSE STOP RECORDING");
    }

    // if (ffmpegProcess) {
    //   console.log("🧹 Stopping current FFmpeg segment");
    //   ffmpegProcess.kill("SIGINT");

    //   // ⛔ IMPORTANT: wait for clean close
    //   await new Promise(resolve =>
    //     ffmpegProcess.once("close", resolve)
    //   );

    //   ffmpegProcess = null;
    // }

    console.log("⏸ RECORDING PAUSED at", RECORDING_STATE.pausedAt);

    res.json({   success: true,
      filename: RECORDING_STATE.filename,
      state: RECORDING_STATE.status,
      RECORDING_STATE :RECORDING_STATE,});


  } catch (err) {
    console.error("PAUSE_FAILED:", err);
    res.status(500).json({ error: "PAUSE_FAILED" });
  }
});


app.post("/resume", (req, res) => {

    console.log("▶ RESUMED request RECIEVE");
    if (!RECORDING_STATE.active || !RECORDING_STATE.paused){
    return res.status(400).json({ error: "INVALID_STATE" });
      }

  try{
  

    const baseName = RECORDING_STATE.filename ; 
    console.log("RESUME baseName NAME ",baseName);
    const segmentPath = getNextSegmentPath(baseName);
    console.error("RESUME NEW SEGMENT NAME ",segmentPath);
    const pausedDuration = Date.now() - RECORDING_STATE.pausedAt;
  
   RECORDING_STATE.curr_segment = segmentPath;
  RECORDING_STATE.segments.push(segmentPath);
  RECORDING_STATE.status = "RECORDING";
  RECORDING_STATE.filename = baseName;
  RECORDING_STATE.totalPausedMs += pausedDuration;
  RECORDING_STATE.paused = false;
  RECORDING_STATE.pausedAt = null; // ✅ VERY IMPORTANT
  RECORDING_STATE.active = true;

        // ▶ Start FFmpeg
    const result = RUN_FFMPEG_ARGUMENT_COMMAND({ enableLive: LIVE_STREAM_ENABLED,outputPath: segmentPath });
    if (!result.success) {
      console.error("❌ RESUME_START_FAILED", result);
      return res.status(500).json({
        error: "RESUME_START_FAILED",
        reason: result.reason
      });
    }

    console.log("▶ RECORDING RESUMED");
    res.json({
        success: true,
        filename : RECORDING_STATE.filename,
        state:    RECORDING_STATE.status,
        RECORDING_STATE : RECORDING_STATE
        });

  }catch (err){
    console.error("RESUME FAILED:", err);
    res.status(500).json({ error: "RESUME_FAILED" });
            }

});


let segmentListFile = null;
app.post("/stop", async (req, res) => {

  console.log("⏹ STOP request received");
  if(!RECORDING_STATE.active){
      console.log("NO_ACTIVE_RECORDING");
      return res.status(400).json({ error: "NO_ACTIVE_RECORDING" });  
    }

  try{

    if (ffmpegProcess){

       console.log("🧹 Stopping FFmpeg...");
      //  ffmpegProcess.kill("SIGINT");
      // await new Promise(resolve => ffmpegProcess.once("close", resolve));
      //  ffmpegProcess = null;
         await stopFFmpeg("⛔RECORDING STOP REQUEST RECORDING");
     }

    const segments = RECORDING_STATE.segments;
    console.log("SEGMENTS  FILE NAME:", segments);
    if (!segments || segments.length === 0){
      throw new Error("NO_SEGMENTS_FOUND");
    }

 for (const file of segments){
        if (fs.existsSync(file)) {
        console.log("🗑 PRESENT segment FILE :", file); 
      }else{console.log("🗑 NOT FOUND  segment FILE :", file);  }
    }


   let finalMp4 = RECORDING_STATE.FINAL_FILE_PATH;
    if (!finalMp4.endsWith(".mp4")) {
      finalMp4 += ".mp4";
    }console.log("🎬 Final MP4:", finalMp4);



    segmentListFile = path.join(videosDir, "segments.txt");
    fs.writeFileSync(segmentListFile,segments.map(f => `file '${f}'`).join("\n"));
    console.log("📄 Segment list created:", segmentListFile);

     //4️⃣ Merge segments → MP4
      await new Promise((resolve, reject) => {
        const merge = spawn("ffmpeg", [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", segmentListFile,
        "-c", "copy",
        "-movflags", "+faststart",
        finalMp4
      ]);

      //    merge.stderr.on("data", d =>
      //   console.log("FFMPEG_MERGE:", d.toString())
      // );


      merge.on("close", code => {
        if (code === 0 && fs.existsSync(finalMp4)) {
          console.log("✅ MP4 MERGE SUCCESS");
          resolve();
        } else {
          reject(new Error("MERGE_FAILED"));
        }
      });
    });

     //Cleanup temp file 
    for (const file of segments){
        if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log("🗑 Deleted segment:", file); }
    }

      if (fs.existsSync(segmentListFile)) {
      fs.unlinkSync(segmentListFile); }

   // Reset recording state
      RECORDING_STATE.curr_segment = null;
      RECORDING_STATE.status = "IDLE";
       RECORDING_STATE.active = false;
       RECORDING_STATE.paused = false;
       RECORDING_STATE.startTime = null;
       RECORDING_STATE.pausedAt = null;
       RECORDING_STATE.totalPausedMs = 0;
       RECORDING_STATE.timer_msec = null;
       RECORDING_STATE.timer_state = "OFF";
       RECORDING_STATE.audio_mute_flag = false;
    RECORDING_STATE.segments = [];
    currentRecordingMp4 = null;
    console.log("🏁 RECORDING COMPLETED");

    res.json({
        success: true,
        filename : RECORDING_STATE.filename,
        state:    RECORDING_STATE.status,
        RECORDING_STATE : RECORDING_STATE
        });

   
     if(WESOCKET_CONNECTED_FLAG && LIVE_STREAM_ENABLED && liveClients.size  >= 1 && !RECORDING_STATE.active ){
        console.log("RE STARTED LIVE_STREAM_ENABLED");
       notifyLiveClientsReset();
    //  const result = RUN_FFMPEG_ARGUMENT_COMMAND({ enableLive: true,outputPath: null });
    // if (!result.success) {
    //   console.error("❌ stop RE_STARTED LIVE_STREAM_ENABLED", result);
    // }
        }
   
  }catch (err){
 console.error("❌ STOP FAILED REASON:", err.message);
  console.log(" ERROR SEGMENTS  FILE NAME:", RECORDING_STATE.segments);
  
  for (const file of RECORDING_STATE.segments){
     console.log("SEGMENTS_file  FILE NAME:", file);
         if (fs.existsSync(file)) {
           console.log("🗑 Deleted segment:", file);
             fs.unlinkSync(file);
        }
      }
   
    if( segmentListFile && fs.existsSync(segmentListFile)){
       console.log("🗑 Deleted segmentListFile:", segmentListFile);
      fs.unlinkSync(segmentListFile); }


     RECORDING_STATE.curr_segment = null;
    RECORDING_STATE.status = "IDLE";
    RECORDING_STATE.active = false;
    RECORDING_STATE.paused = false;
    RECORDING_STATE.startTime = null;
    RECORDING_STATE.pausedAt = null;
    RECORDING_STATE.totalPausedMs = 0;
    RECORDING_STATE.segments = [];
    currentRecordingMp4 = null;
     RECORDING_STATE.timer_msec = null;
    RECORDING_STATE.timer_state = "OFF";
    RECORDING_STATE.audio_mute_flag = false;
  
        if(WESOCKET_CONNECTED_FLAG && LIVE_STREAM_ENABLED && liveClients.size  >= 1 && !RECORDING_STATE.active ){
        console.log("RE STARTED LIVE_STREAM_ENABLED");
       notifyLiveClientsReset();
    //  const result = RUN_FFMPEG_ARGUMENT_COMMAND({ enableLive: true,outputPath: null });
    // if (!result.success) {
    //   console.error("❌ stop RE_STARTED LIVE_STREAM_ENABLED", result);
    // }
        }
    
    res.status(500).json({error:" STOP_FAILED",});
  }

});

app.post("/reset", async (req, res) => {
   
  stopFFmpeg("🛑reset");

  for (const file of RECORDING_STATE.segments){
     console.log("SEGMENTS_file  FILE NAME:", file);
         if (fs.existsSync(file)) {
           console.log("🗑 Deleted segment:", file);
             fs.unlinkSync(file);
        }
      }
   
    if( segmentListFile && fs.existsSync(segmentListFile)){
       console.log("🗑 Deleted segmentListFile:", segmentListFile);
      fs.unlinkSync(segmentListFile); }


    RECORDING_STATE.curr_segment = null;
    RECORDING_STATE.status = "IDLE";
    RECORDING_STATE.active = false;
    RECORDING_STATE.paused = false;
    RECORDING_STATE.startTime = null;
    RECORDING_STATE.pausedAt = null;
    RECORDING_STATE.totalPausedMs = 0;
    RECORDING_STATE.segments = [];
    currentRecordingMp4 = null;
     RECORDING_STATE.timer_msec = null;
    RECORDING_STATE.timer_state = "OFF";
    RECORDING_STATE.audio_mute_flag = false;

         if(WESOCKET_CONNECTED_FLAG && LIVE_STREAM_ENABLED && liveClients.size  >= 1 && !RECORDING_STATE.active ){
        console.log("RE STARTED LIVE_STREAM_ENABLED");
       notifyLiveClientsReset();
    //  const result = RUN_FFMPEG_ARGUMENT_COMMAND({ enableLive: true,outputPath: null });
    // if (!result.success) {
    //   console.error("❌ stop RE_STARTED LIVE_STREAM_ENABLED", result);
    // }
        }

        res.json({
        success: true,
        filename : RECORDING_STATE.filename,
        state:    RECORDING_STATE.status,
        RECORDING_STATE : RECORDING_STATE
        });
  
});

let ffmpegClosingPromise = null;

function waitForFFmpegClose() {
  if (!ffmpegProcess) return Promise.resolve();

  if (!ffmpegClosingPromise) {
    ffmpegClosingPromise = new Promise(resolve => {
      ffmpegProcess.once("close", () => {
        console.log("✅ FFMPEG FULLY CLOSED");
        ffmpegProcess = null;
        ffmpegClosingPromise = null;
        resolve();
      });
    });
  }
  return ffmpegClosingPromise;
}

wss.on("connection", async ws => {

  console.log("WS CLIENT CONNECTED REQUEST");

  liveClients.add(ws);
  WESOCKET_CONNECTED_FLAG = true;
  console.log("LIVE CLIENT COUNT:", liveClients.size);

  // ▶ Start live stream only for first client
  if ( !RECORDING_STATE.active) {

    // 🔥 WAIT if ffmpeg is still closing
    if (ffmpegProcess) {
      console.log("⏳ Waiting for FFmpeg to close before starting live");
       waitForFFmpegClose();
    }

    console.log("🎥 STARTING IDLE LIVE STREAM (WS)");
    const result = RUN_FFMPEG_ARGUMENT_COMMAND({enableLive: true,outputPath: null });

    if (!result.success) {
      console.error("❌ LIVE FFMPEG FAILED", result);
    }
  }

  ws.on("close", async () => {

    console.log("WS CLIENT DISCONNECTED");
    liveClients.delete(ws);
    console.log("LIVE CLIENT COUNT:", liveClients.size, RECORDING_STATE.active);
    // ⏹ Stop live stream only when LAST client leaves
    if (liveClients.size === 0 && !RECORDING_STATE.active) {
      console.log("🛑 NO LIVE CLIENTS → STOPPING LIVE FFMPEG");
      WESOCKET_CONNECTED_FLAG = false;
        stopFFmpeg("🛑 LAST WS CLIENT LEFT");
      
    }
  });
});



// function startIdleLiveStream(){

//   if (ffmpegProcess && !RECORDING_STATE.active && WESOCKET_CONNECTED_FLAG  && LIVE_STREAM_ENABLED ){
//          console.log("KILL ffmpegProcess STREAM STOPPED");
//          ffmpegProcess.kill("SIGINT");
//          ffmpegProcess = null;
//       }


// console.log("🎥 startIdleLiveStream STARTING IDLE LIVE STREAM");

//   ffmpegProcess = spawn("ffmpeg", [
//   "-loglevel", "error",
//   "-f", "v4l2",
//   "-input_format", "h264",
//   "-video_size", "1920x1080",//CAMERA_CONFIGURATION.resolution, //     
//    "-framerate", "20",      //"-framerate",CAMERA_CONFIGURATION.fps,
//   "-i", "/dev/video0",
//   "-c:v", "copy",
//   // "-c:v libx264",
//   //"-preset", "veryfast",
//   //"-tune", "zerolatency",
//  // "-pix_fmt", "yuv420p",
//   //"-profile:v", "baseline",
//  // "-level", "4.2",
//  // "-b:v", "5M",
//  // "-maxrate", "5M",
//  // "-bufsize", "10M",
//  // "-g", "30", 
//   // fMP4 FOR MSE
//   "-f", "mp4",
//   "-movflags", "frag_keyframe+empty_moov+default_base_moof",
//   "-frag_duration", "100000",   // 100ms fragments
//   "pipe:1"
// ]);


// ffmpegProcess.stdout.on("data", chunk => {
//  console.log("FFMPEG STREAM data ",chunk);
//  if(WESOCKET_CONNECTED_FLAG  && LIVE_STREAM_ENABLED  ){
//   wss.clients.forEach(client => {
//         if (client.readyState === WebSocket.OPEN) {
//           client.send(chunk);
//          }
//         }); }

//      });


//   ffmpegProcess.on("close", () => {
//     console.log("🛑 IDLE LIVE STOPPED");
//    // ffmpegProcess = null;
//   });
// }


// wss.on("connection", ws => {
//   WESOCKET_CONNECTED_FLAG = true;
//   console.log("WS CLIENT CONNECTED REQUEST");
//   if(WESOCKET_CONNECTED_FLAG && LIVE_STREAM_ENABLED){
//     console.log("BOTH LIVE STREMING STARTED ");
//    startIdleLiveStream(); 
//    }else{

//   //   detectUsbCamera(videoDev =>{
//   // if(!videoDev){
//   //   console.log("HD CAMERA NOT DETECTED:");
//   //    return res.status(400).json({ error:"HD CAMERA NOT DETECTED"});
//   //   }
//   // });

//   if(!live_ffmpeg){

//    console.log("IDLE LIVE STREMING STARTED ");

//     live_ffmpeg =  spawn("ffmpeg", [
//   "-loglevel", "error",
//   "-f", "v4l2",
//   "-input_format", "h264",
//   "-video_size", "1920x1080",//CAMERA_CONFIGURATION.resolution, //     
//    "-framerate", "20",      //"-framerate",CAMERA_CONFIGURATION.fps,
//   "-i", "/dev/video0",
//   "-c:v", "copy",
//   // "-c:v libx264",
//   //"-preset", "veryfast",
//   //"-tune", "zerolatency",
//  // "-pix_fmt", "yuv420p",
//   //"-profile:v", "baseline",
//  // "-level", "4.2",
//  // "-b:v", "5M",
//  // "-maxrate", "5M",
//  // "-bufsize", "10M",
//  // "-g", "30", 
//   // fMP4 FOR MSE
//   "-f", "mp4",
//   "-movflags", "frag_keyframe+empty_moov+default_base_moof",
//   "-frag_duration", "100000",   // 100ms fragments
//   "pipe:1"
// ]);

//   }else{live_ffmpeg.kill("SIGINT"); }

//  live_ffmpeg.stdout.on("data", chunk => {
//   // console.log("FFMPEG STREAM data ",chunk);
//      wss.clients.forEach(client => {
//     if(client.readyState === WebSocket.OPEN) {
//           client.send(chunk);
//          }
//         });
//      });


//      live_ffmpeg.on("close", () => {
//      if( live_ffmpeg){
//       console.log("NULL FFMPEG STREAM STOPPED");
//     //    //live_ffmpeg.kill("SIGINT");
//     //  // live_ffmpeg = null; 
//       }
//      });

//   }


//  ws.on("close", () => {
//    console.log("WS CLIENT DISCONNECTED REQUEST ");
//    WESOCKET_CONNECTED_FLAG = false;

//     if(wss.clients.size === 0 && live_ffmpeg){
//       console.log("KILL FFMPEG STREAM STOPPED");
//       live_ffmpeg.kill("SIGINT");
//       live_ffmpeg = null;
//      }

//       if (ffmpegProcess && !RECORDING_STATE.active && WESOCKET_CONNECTED_FLAG  && LIVE_STREAM_ENABLED ){
//          console.log("KILL ffmpegProcess STREAM STOPPED");
//          ffmpegProcess.kill("SIGINT");
//          ffmpegProcess = null;
//       }
//   });

// });




// function isSafeName(name) {
//   return typeof name === "string" &&
//          name.length > 0 &&
//          !name.includes("..") &&
//          !name.includes("/") &&
//          !name.includes("\\");
// }

function isSafeName(name) {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}
function isSafeName(name) {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}


function sendError(res, status, code, message, details = {}) {
  return res.status(status).json({
    success: false,
    error: { code, message, details }
  });
}


app.get("/api/recordings/:folder", (req, res) => {

  try {
    // 1️⃣ Detect SD card
    detectSdCard(sdMount => {
      if (!sdMount) {
        console.error("❌ SD CARD NOT DETECTED");
        return res.status(400).json({ error: "SD_CARD_NOT_DETECTED" });
      }

      // 2️⃣ Validate folder name (security)
      const folderName = req.params.folder;
      if (!folderName || folderName.includes("..")) {
        return res.status(400).json({ error: "INVALID_FOLDER_NAME" });
      }

      // 3️⃣ Build folder path
      const folderPath = path.join(sdMountPoint, "videos", folderName);

      if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: "FOLDER_NOT_FOUND" });
      }

      if (!fs.statSync(folderPath).isDirectory()) {
        return res.status(400).json({ error: "NOT_A_DIRECTORY" });
      }

      // 4️⃣ Read files safely
      let files;
      try {
        files = fs.readdirSync(folderPath);
      } catch (err) {
        console.error("❌ READDIR FAILED:", err.message);
        return res.status(500).json({ error: "READ_DIRECTORY_FAILED" });
      }

      let totalSizeBytes = 0;

      const videos = files
         .filter(f => f.toLowerCase().endsWith(".mp4") && !(f.toLowerCase().includes("_part")))
        .map(file => {
          const fullPath = path.join(folderPath, file);

          try {
            const stats = fs.statSync(fullPath);
            totalSizeBytes += stats.size;

            // 5️⃣ Duration using ffprobe
            let duration = "N/A";
            let durationSec = null;

            try {
              const seconds = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullPath}"`
              ).toString().trim();

              if (seconds && !isNaN(seconds)) {
                durationSec = Number(seconds);
                duration = new Date(durationSec * 1000)
                  .toISOString()
                  .substr(11, 8);
              }
            } catch {
              console.warn("⚠️ ffprobe failed:", fullPath);
            }

            return {
              name: file,
              type: path.extname(file).slice(1).toUpperCase(),
              sizeBytes: stats.size,
              sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
              created: stats.birthtime
                .toISOString()
                .replace("T", " ")
                .slice(0, 19),
              duration,
              durationSec,
              url: `/videos/${folderName}/${file}`
            };

          } catch (err) {
            console.error("❌ FILE STAT FAILED:", fullPath, err.message);
            return null;
          }
        })
        .filter(Boolean) // remove failed entries
        .sort((a, b) => b.created.localeCompare(a.created));

      // 6️⃣ Final response
      res.json({
        folder: folderName,
        fileCount: videos.length,
        totalSizeBytes,
        totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
        videos
      });
    });

  } catch (err) {
    console.error("💥 UNHANDLED ERROR:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

app.get("/api/recordings", (req, res) => {

  detectSdCard(sdMount => {
    try {

      // 1️⃣ SD card check
      if (!sdMount) {
        console.error("❌ SD CARD NOT DETECTED");
        return res.status(400).json({ error: "SD_CARD_NOT_DETECTED" });
      }

      const baseDir = path.join(sdMount, "videos");

      // 2️⃣ Base folder check
      if (!fs.existsSync(baseDir)) {
        console.error("❌ VIDEOS FOLDER NOT FOUND:", baseDir);
        return res.status(404).json({ error: "VIDEOS_FOLDER_NOT_FOUND" });
      }

      // 3️⃣ Read folders safely
      const dirents = fs.readdirSync(baseDir, { withFileTypes: true });

      const folders = dirents
        .filter(d => d.isDirectory())              // only folders
        .map(d => {
          const folderPath = path.join(baseDir, d.name);

          let files;
          try {
            files = fs.readdirSync(folderPath)
              .filter(f => f.toLowerCase().endsWith(".mp4") && !(f.toLowerCase().includes("_part")));
          } catch (err) {
            console.error("⚠️ Folder read failed:", folderPath, err.message);
            return null; // skip this folder
          }

          if (files.length === 0) return null; // skip empty folders

          let totalSizeBytes = 0;
          let lastModifiedMs = 0;

          files.forEach(file => {
            try {
              const fullPath = path.join(folderPath, file);
              const stats = fs.statSync(fullPath);

              totalSizeBytes += stats.size;
              lastModifiedMs = Math.max(lastModifiedMs, stats.mtimeMs);
            } catch (err) {
              console.error("⚠️ File stat failed:", file, err.message);
            }
          });

          return {
            name: d.name,
            path: d.name,
            fileCount: files.length,
            totalSizeBytes, // raw value
            totalSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
            modifiedMs: lastModifiedMs,
            modified: lastModifiedMs
              ? new Date(lastModifiedMs).toISOString().replace("T", " ").slice(0, 19)
              : "-"
          };
        })
        .filter(Boolean) // remove nulls
        .sort((a, b) => b.modifiedMs - a.modifiedMs); // newest first

      console.log("✅ RECORDINGS INDEX BUILT:", folders.length, "folders");

      return res.json({
        success: true,
        sdMount,
        folderCount: folders.length,
        folders
      });

    } catch (err) {
      console.error("💥 API FAILURE:", err);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: err.message
      });
    }
  });

});



app.get("/api/download/folder/:folder", (req, res) => {

  if (RECORDING_STATE.active) {
    return res.status(409).json({
      error: "RECORDING_IN_PROGRESS",
      message: "Stop recording before downloading"
    });
  }

  detectSdCard(sdMount => {

    const folder = req.params.folder;
    const folderPath = path.join(sdMountPoint, "videos", folder);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "FOLDER_NOT_FOUND" });
    }

    const files = fs.readdirSync(folderPath)
      .filter(f => f.toLowerCase().endsWith(".mp4"))
      .filter(f => {
        const stat = fs.statSync(path.join(folderPath, f));
        return stat.size > 0; // stable file
      });

    if (files.length === 0) {
      return res.status(400).json({ error: "NO_FINALIZED_FILES" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folder}.zip"`);

    const archive = require("archiver")("zip", { zlib: { level: 9 } });

    archive.pipe(res);

    for (const file of files) {
      archive.file(path.join(folderPath, file), { name: file });
    }

    archive.finalize();
  });
});


app.get("/api/download/file/:folder/:filename", (req, res) => {

  // 1️⃣ Do not allow download during recording
  if (RECORDING_STATE.active) {
    return res.status(409).json({
      error: "RECORDING_IN_PROGRESS",
      message: "Stop recording before downloading files"
    });
  }

  detectSdCard(sdMount => {
    if (!sdMount) {
      return sendError(res, 400, "SD_CARD_NOT_DETECTED", "SD card not mounted");
    }

    const { folder, filename } = req.params;

    // 2️⃣ Security: prevent path traversal
    if (!isSafeName(folder) || !isSafeName(filename)) {
      return sendError(res, 400, "INVALID_PATH", "Invalid folder or filename");
    }

    // 3️⃣ Allow only video files
    const allowedExt = [".mp4"];
    const ext = path.extname(filename).toLowerCase();
    if (!allowedExt.includes(ext)) {
      return sendError(res, 400, "INVALID_FILE_TYPE", "Only MP4 files allowed");
    }

    const filePath = path.join(sdMountPoint, "videos", folder, filename);

    // 4️⃣ File existence
    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "FILE_NOT_FOUND", "Requested file not found");
    }

    const stat = fs.statSync(filePath);

    // 5️⃣ Must be a regular file
    if (!stat.isFile()) {
      return sendError(res, 400, "NOT_A_FILE", "Target is not a file");
    }

    // 6️⃣ Avoid sending empty / corrupted files
    if (stat.size === 0) {
      return sendError(res, 400, "EMPTY_FILE", "File is empty or invalid");
    }

    // 7️⃣ Headers (browser + download safe)
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Accept-Ranges", "bytes");

    // 8️⃣ Stream file safely
    const stream = fs.createReadStream(filePath);

    stream.on("error", err => {
      console.error("FILE STREAM ERROR:", err);
      if (!res.headersSent) {
        sendError(res, 500, "STREAM_ERROR", "Failed to stream file");
      }
    });

    // 9️⃣ Handle client disconnect
    res.on("close", () => {
      if (!res.writableEnded) {
        console.warn("Client aborted download:", filename);
        stream.destroy();
      }
    });

    stream.pipe(res);
  });
});


const LOCK_FILE = "/tmp/khadas_camera_server.lock";

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const oldPid = Number(fs.readFileSync(LOCK_FILE, "utf8"));

      // Check if process is still alive
      try {
        process.kill(oldPid, 0);
        console.error(`❌ Server already running (PID ${oldPid})`);
        process.exit(1);
      } catch {
        // PID is stale → overwrite lock
        console.log("⚠️ Stale lock found, cleaning up");
      }
    }

    fs.writeFileSync(LOCK_FILE, process.pid.toString());
  } catch (err) {
    console.error("LOCK ERROR:", err);
    process.exit(1);
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

//acquireLock();


const DESIRED_HOSTNAME = "camera";

function ensureHostname() {
  try {
    const current = execSync("hostname").toString().trim();

    if (current === DESIRED_HOSTNAME) {
      console.log(`✅ Hostname already set: ${current}`);
      return;
    }

    // Check root
    if (process.getuid && process.getuid() !== 0) {
      console.error("❌ Hostname mismatch!");
      console.error(`   Current : ${current}`);
      console.error(`   Required: ${DESIRED_HOSTNAME}`);
      console.error("👉 Run server with: sudo node server.js");
      process.exit(1);
    }

    console.log(`🔧 Changing hostname → ${DESIRED_HOSTNAME}`);

    execSync(`hostnamectl set-hostname ${DESIRED_HOSTNAME}`);

    // Rewrite /etc/hosts safely
    const hosts = `
127.0.0.1   localhost
127.0.1.1   ${DESIRED_HOSTNAME}

::1         localhost ip6-localhost ip6-loopback
fe00::0     ip6-localnet
ff00::0     ip6-mcastprefix
ff02::1     ip6-allnodes
ff02::2     ip6-allrouters
`.trim() + "\n";

    fs.writeFileSync("/etc/hosts", hosts);

    execSync("systemctl restart avahi-daemon");

    console.log(`✅ Hostname changed to ${DESIRED_HOSTNAME}.local`);
    console.log("🔁 Reboot recommended for full consistency");

  } catch (err) {
    console.error("❌ Failed to configure hostname:", err.message);
    process.exit(1);
  }
}


const bonjour = require("bonjour")();
let mdnsService = null;
const MDNS_CONFIG = {
  enabled: true,
  serviceName: "Khadas Camera Server",
  hostname: DESIRED_HOSTNAME,          // → camera.local
  type: "http",
  port: PORT,
  protocol: "tcp",
  txt: {
    device: "khadas",
    service: "camera",
    version: "1.0",
    ws: "enabled",
    stream: "h264",
  },
  interface: null,             // null = all interfaces
  ttl: 120                     // seconds
};



function startMDNS() {
  if (!MDNS_CONFIG.enabled) {
    console.log("ℹ️ mDNS disabled by config");
    return;
  }

  try {


    mdnsService = bonjour.publish({
      name: MDNS_CONFIG.serviceName,
      host: MDNS_CONFIG.hostname,
      type: MDNS_CONFIG.type,
      protocol: MDNS_CONFIG.protocol,
      port: MDNS_CONFIG.port,
      txt: MDNS_CONFIG.txt,
      ttl: MDNS_CONFIG.ttl
    });

    mdnsService.on("up", () => {
      console.log(`📡 mDNS UP → http://${MDNS_CONFIG.hostname}.local:${MDNS_CONFIG.port}`);
    });

    mdnsService.on("error", err => {
      console.error("❌ mDNS SERVICE ERROR:", err.message);
    });

  } catch (err) {
    console.error("❌ mDNS INIT FAILED:", err.message);
  }
}

function monitorMDNS() {
  setInterval(() => {
    if (!mdnsService) {
      console.error("❌ mDNS DOWN — RESTARTING MDNS ......");
      try {
        startMDNS();
      } catch (e) {
        console.error("❌  RESTARTING MDNS FAILED:", e.message);
      }
    }
  }, 10000); // every 10s
}

function stopMDNS() {
  try {
    if (mdnsService) {
      mdnsService.stop(() => {
        console.log("📴 mDNS service stopped");
      });
      mdnsService = null;
    }

    if (bonjour) {
      bonjour.destroy();
     // bonjour = null;
    }
  } catch (err) {
    console.error("⚠️ mDNS cleanup error:", err.message);
  }
}


//process is a global object in Node.js.
// Property	MeaningNORE
// process.pid	Process ID (PID)
// process.argv	Command-line arguments
// process.cwd()	Current working directory
// process.exit()	Stop the program
// process.on()	Listen for signals (SIGINT, SIGTERM)
// process.env	Environment variables 
// Case	Exit code
// process.exit(0)	0
// process.exit(1)	1
// SIGINT	130
// SIGTERM	143
// SIGKILL	137
// Exit Code	Meaning
// 0	Success
// 1	Error
// >1	Specific error
// >128	Killed by signal


if (process.env.NODE_ENV !== "production") {
  console.log("🧪 TEST MODE ON ");
} else {
  console.log("🚀 PRODUCTION MODE");
//console.log("ENVIROMENT VARIABLE PORT",process.env.PORT);     
//console.log("ENVIROMENT VARIABLE PRODUCT DETAIL",Mprocess.env.NODE_ENV); 
}



function gracefulShutdown(signal) {

  console.log(`\n🛑 SERVER SHUTDOWN (SIGINT) received: ${signal}`);

  if (ffmpegProcess) {
   console.log("🧹 Stopping ffmpeg process...");
    ffmpegProcess.kill("SIGINT");
    ffmpegProcess = null;
  }
      stopMDNS();

     server.close(() => {
    console.log("🚪 HTTP server closed");  });
    


// releaseLock();
process.exit(0);


}



function cleanupPort(port) {  //fuser finds which process is using a port and can kill it.
  try {
    execSync(`sudo fuser -k ${port}/tcp`);
    console.log(`🧹 Cleared port ${port}`);
  } catch {
    console.log(`ℹ️ Port ${port} already free`);
  }
}

process.on("SIGINT", gracefulShutdown); //Terminal / Ctrl+C
process.on("SIGTERM", gracefulShutdown); // systemd / OS systemctl stop, reboot

process.on("uncaughtException", err => {
  console.error("💥 UNCAUGHT EXCEPTION:", err);
  //cleanupPort(PORT);
  gracefulShutdown("uncaughtException");
});


process.on("unhandledRejection", err => {
  console.error("💥 UNHANDLED PROMISE:", err);
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ PORT ${PORT} ALREADY IN USE`);
    console.error("👉 Stop existing server or change PORT");
    process.exit(1);
  } else {
    console.error("❌ SERVER ERROR:", err);
    process.exit(1);
  }
});

ensureHostname();
cleanupPort(PORT);


server.listen(PORT, () => {

  console.log(`Camera server running on http://0.0.0.0:${PORT}`);
  startMDNS();
  monitorMDNS();
});