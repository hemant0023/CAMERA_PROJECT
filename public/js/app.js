
let state = "IDLE";
let seconds = 0;
let timerInterval = null;

const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");
const filenameInput = document.getElementById("filename");


function updateUI() {
  console.log("UI UPDATE → state:", state);
  startBtn.disabled  = state !== "IDLE";
  pauseBtn.disabled  = state !== "RECORDING";
  resumeBtn.disabled = state !== "PAUSED";
  stopBtn.disabled   = state === "IDLE";

  statusEl.textContent = state;
  statusEl.className = `badge ${state.toLowerCase()}`;
}

function renderTimer() {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  timerEl.textContent = `${h}:${m}:${s}`;
}

function startTimer() {

  if (timerInterval) return;
   timerInterval = setInterval(() => {
    seconds++;
    renderTimer();
  }, 1000);

}

function stopTimer() {

  clearInterval(timerInterval);
  timerInterval = null;
  seconds = 0;
  renderTimer();
}

function pauseTimer(){

  clearInterval(timerInterval);
  timerInterval = null;
}

function computeElapsedSeconds(data) {

  if (!data.startTime) return 0;

  const now = Date.now();

  // If paused, freeze time at pausedAt

  const effectiveNow = data.paused ? data.pausedAt || now: now;

  const elapsedMs = effectiveNow - data.startTime - (data.totalPausedMs || 0);
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

async function restoreRecordingState() {
  try {
    const res = await fetch("/api/recording/status");
    const data = await res.json();

    if (!data.active){
      state = "IDLE";
      updateUI();
      startWSStream();
      return;
    }

    state = data.paused ? "PAUSED" : "RECORDING";
    filenameInput.value = data.filename || "";
    filenameInput.disabled = true;

    seconds = computeElapsedSeconds(data);
   
    if (!data.paused) startTimer();
    updateUI();

  } catch (err) {
    console.error("STATE RESTORE FAILED", err);
  }
}

restoreRecordingState();

// /**********************
//  * WEBSOCKET STREAM
//  **********************/
// let ws = null;
// let lastURL = null;



// function startWSStream() {
//   if (ws && ws.readyState === WebSocket.OPEN) return;

//   ws = new WebSocket(`ws://${location.host}`);
//   ws.binaryType = "arraybuffer";

//   ws.onopen = () => {
//     console.log("WS CONNECTED");
//   };



//   ws.onmessage = event => {
//     const blob = new Blob([event.data], { type: "image/jpeg" });
//     const url = URL.createObjectURL(blob);

//     liveFeed.src = url;

//     if (lastURL) URL.revokeObjectURL(lastURL);
//     lastURL = url;
//   };


//   ws.onerror = err => {
//     console.error("WS ERROR", err);
//   };


//   ws.onclose = () => {
//     console.warn("WS CLOSED");
//     ws = null;
//   };
// }

// function stopWSStream() {
//   if (ws) {
//     ws.close();
//     ws = null;
//   }
// }

/**********************
 * RECORDING CONTROL
 **********************/
/**********************
 * WEBSOCKET STREAM (H.264 + MSE)
 **********************/
let ws = null;
let mediaSource = null;
let sourceBuffer = null;
let queue = [];

const liveFeed = document.getElementById("liveFeed");

function onUpdateEnd(){
  if (queue.length > 0 && !sourceBuffer.updating) {
    sourceBuffer.appendBuffer(queue.shift());
  }
}

function resetMSE() {
  console.log("🔄 RESETTING MEDIA SOURCE");

  try {
    if (sourceBuffer) {
      if (sourceBuffer.updating) {
        sourceBuffer.abort();
      }
      sourceBuffer.removeEventListener("updateend", onUpdateEnd);
    }
  } catch {}

  try {
    if (mediaSource && mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }
  } catch {}

  queue = [];
  sourceBuffer = null;
  mediaSource = null;

  liveFeed.src = "";
}


function stopWSStream() {
  
  if (ws){
    ws.close();
    ws = null;
  }

  if (mediaSource) {
    try {
      mediaSource.endOfStream();
    } catch (e) {}
    mediaSource = null;
  }

  sourceBuffer = null;
  queue = [];
}



// function startWSStream() {

//   if (ws && ws.readyState === WebSocket.OPEN) return;

//   //resetMSE(); // 🔑 CRITICAL

//   mediaSource = new MediaSource();
//   liveFeed.src = URL.createObjectURL(mediaSource);

//   mediaSource.addEventListener("sourceopen", () => {
//     console.log("MSE SOURCE OPEN");

//     sourceBuffer = mediaSource.addSourceBuffer(
//       'video/mp4; codecs="avc1.42E01E"'
//     );

//     sourceBuffer.mode = "segments";
//     sourceBuffer.addEventListener("updateend", () => {
//       if (queue.length > 0 && !sourceBuffer.updating) {
//         sourceBuffer.appendBuffer(queue.shift());
//       }
//     });





//     ws = new WebSocket(`ws://${location.host}`);
//     ws.binaryType = "arraybuffer";

//     ws.onopen = () => {
//       console.log("WS CONNECTED");
//     };




//     ws.onmessage = event => {

//       // 🔥 CONTROL MESSAGE
//       // if (typeof event.data === "string") {

//       //   const msg = JSON.parse(event.data);
      
//       //   if (msg.type === "RESET_STREAM") {
//       //     console.warn("🔁 RESET_STREAM RECEIVED");
//       //     ws.close();              // close socket cleanly
//       //     setTimeout(startWSStream, 100); // restart clean
//       //     return;
//       //   }
//       // }



//       // 🎥 VIDEO DATA
//       const chunk = new Uint8Array(event.data);
//       if (!sourceBuffer.updating && queue.length === 0) {
//         sourceBuffer.appendBuffer(chunk);
//       } else {
//         queue.push(chunk);
//       }
//     };



//     ws.onerror = err => {
//       console.error("WS ERROR", err);
//     };

//     ws.onclose = () => {
//       console.warn("WS CLOSED");
//         stopWSStream();
//         //resetMSE();
//     };
//   });
// }


function startWSStream() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  resetMSE(); // 🔑 CRITICAL

  mediaSource = new MediaSource();
  liveFeed.src = URL.createObjectURL(mediaSource);

  mediaSource.addEventListener("sourceopen", () => {
    console.log("MSE SOURCE OPEN");

    // H.264 baseline profile (works everywhere)
    sourceBuffer = mediaSource.addSourceBuffer(
      'video/mp4; codecs="avc1.42E01E"'
    );

    sourceBuffer.mode = "segments";
    sourceBuffer.addEventListener("updateend", () => {
      if (queue.length > 0 && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(queue.shift());
      }
    });

    ws = new WebSocket(`ws://${location.host}`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("WS CONNECTED");
    };

    ws.onmessage = event => {


 if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        if (msg.type === "CLEAR_STREAM") {
          console.warn("🔁 CLEAR_STREAM RECEIVED");
         // stopWSStream();          // close socket cleanly
          resetMSE();
          //setTimeout(startWSStream, 100); // restart clean
         // return;
        }
      }

     if (typeof event.data === "string") {

        const msg = JSON.parse(event.data);
      
        if (msg.type === "RESET_STREAM") {
          console.warn("🔁 RESET_STREAM RECEIVED");
          stopWSStream();          // close socket cleanly
          resetMSE();
          setTimeout(startWSStream, 100); // restart clean
          return;
        }
      }

      const chunk = new Uint8Array(event.data);
      if (!sourceBuffer.updating && queue.length === 0) {

        sourceBuffer.appendBuffer(chunk);
      } else {
        queue.push(chunk);
      }
    };

    ws.onerror = err => {
      console.error("WS ERROR", err);
    };

    ws.onclose = () => {
      console.warn("WS CLOSED");
      stopWSStream();
    };
  });
}







startBtn.onclick = async () => {
//const filename = filenameInput.value;

  console.log("startBtn BUTTON CLICKED");

const filename = filenameInput.value.trim();
  try {
  
    const res = await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename })
    });

    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || "START_FAILED";
      statusEl.className = "badge idle";
      return;
    }else{
      if(data.success == true){
      statusEl.textContent = data.state || "RECORDING";
       statusEl.className = "badge idle";
      }else{
      statusEl.textContent = data.state || "START_FAILED";
       statusEl.className = "badge idle";
      return;
      }
     
    }
    //stopWSStream();  // 🔥 stop live view during recording
    filenameInput.value = data.filename || filename;
    filenameInput.disabled = true;
    seconds = 0;
    state = "RECORDING";
    startTimer();
    updateUI();  

     
  } catch (err) {
    console.error(err);
    statusEl.textContent = "SERVER ERROR";
  }
};

pauseBtn.onclick = async () => {
  console.log("PAUSE BUTTON CLICKED");

  try {
    const res = await fetch("/pause", { method: "POST" });
    const data = await res.json();

    console.log("PAUSE RESPONSE:", data);

    if (!res.ok) {
      alert(data.error || "PAUSE FAILED");
      return;
    }

    state = "PAUSED";
    pauseTimer();
    updateUI();

  } catch (err) {
    console.error("PAUSE REQUEST ERROR:", err);
  }
};

resumeBtn.onclick = async () => {
   console.log("resumeBtn BUTTON CLICKED");
  try {
    const res = await fetch("/resume", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    state = "RECORDING";
    startTimer();
    updateUI();

  } catch (err) {
    console.error("Resume failed", err);
  }
};


stopBtn.onclick = async () => {

   console.log("stopBtn BUTTON CLICKED");
  try {
    await fetch("/stop", { method: "POST" });

    pauseTimer();
    stopTimer();

    state = "IDLE";
    filenameInput.disabled = false;
    updateUI();
  // startWSStream(); // 🔥 resume live view
    

  }catch (err){
    console.error("Stop failed", err);

  }
};



