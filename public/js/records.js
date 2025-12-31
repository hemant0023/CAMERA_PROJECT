"use strict";

/* ===============================
   DOM REFERENCES
================================ */
const folderView = document.getElementById("folderView");
const videoView  = document.getElementById("videoView");
const backBtn    = document.getElementById("backBtn");
const pathLabel  = document.getElementById("pathLabel");

const modal  = document.getElementById("videoModal");
const player = document.getElementById("videoPlayer");

/* ===============================
   STATE
================================ */
let currentFolder = null;
let modalOpen = false;

/* ===============================
   SAFE FETCH WRAPPER
================================ */
async function safeFetch(url) {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("Fetch failed:", url, err);
    showError(`Failed to load data from server`);
    return null;
  }
}

/* ===============================
   UI ERROR DISPLAY
================================ */
function showError(message) {
  alert(`❌ ERROR:\n${message}`);
}

/* ===============================
   LOAD FOLDERS
================================ */
async function loadFolders() {
  const data = await safeFetch("/api/recordings");
  if (!data || !Array.isArray(data.folders)) return;

  folderView.className = "list-box folder";
  folderView.innerHTML = `
    <div class="header">
      <span>Folder</span>
      <span>Files</span>
      <span>Total Size</span>
      <span>Modified</span>
    </div>
  `;

  if (data.folders.length === 0) {
    folderView.innerHTML += `
      <div class="row">
        <span>No recordings found</span>
        <span>-</span><span>-</span><span>-</span>
      </div>`;
    return;
  }

  data.folders.forEach(f => {
    const row = document.createElement("div");
    row.className = "row clickable";

    row.innerHTML = `
      <span>📁 ${f.name}</span>
      <span>${f.fileCount ?? "-"}</span>
      <span>${f.totalSize ?? "-"}</span>
      <span>${f.modified ?? "-"}</span>
    `;

    row.onclick = () => openFolder(f.name);
    folderView.appendChild(row);
  });
}

/* ===============================
   OPEN FOLDER
================================ */
async function openFolder(folder) {
  currentFolder = folder;

  folderView.classList.add("hidden");
  videoView.classList.remove("hidden");
  backBtn.classList.remove("hidden");

  pathLabel.textContent = `/videos/${folder}`;

  const data = await safeFetch(`/api/recordings/${folder}`);
  if (!data || !Array.isArray(data.videos)) return;

  renderVideos(data.videos);
}

/* ===============================
   RENDER VIDEOS
================================ */
function renderVideos(videos) {
  videoView.className = "list-box video";
  videoView.innerHTML = `
    <div class="header">
      <span>#</span>
      <span>File</span>
      <span>Type</span>
      <span>Size</span>
      <span>Duration</span>
      <span>Created</span>
      <span>Action</span>
    </div>
  `;

  if (videos.length === 0) {
    videoView.innerHTML += `
      <div class="row">
        <span>-</span>
        <span>No videos found</span>
        <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
      </div>`;
    return;
  }

  videos.forEach((v, index) => {
    if (!v.url) return;

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <span>${index + 1}</span>
      <span>🎥 ${v.name}</span>
      <span>${v.type}</span>
      <span>${v.sizeMB}</span>
      <span>${v.duration}</span>
      <span>${v.created}</span>
      <span>
        <button onclick="playVideo('${v.url}')">▶ Play</button>
        <a href="${v.url}" download>⬇</a>
      </span>
    `;

    videoView.appendChild(row);
  });
}

/* ===============================
   BACK BUTTON
================================ */
backBtn.onclick = () => {
  stopAndResetPlayer();

  videoView.classList.add("hidden");
  folderView.classList.remove("hidden");
  backBtn.classList.add("hidden");

  pathLabel.textContent = "/videos";
  currentFolder = null;
};

/* ===============================
   VIDEO PLAYBACK
================================ */
function playVideo(url) {
  if(!url){
    showError("Invalid video URL");
    return;
  }

  try {

    stopAndResetPlayer();
    player.src = url;
    modal.classList.remove("hidden");
    modalOpen = true;

      player.play().catch(err => {
      console.warn("Playback blocked:", err);
    });

  } catch (err) {
    console.error("Play error:", err);
    showError("Unable to play video");
  }
}

/* ===============================
   STOP & RESET PLAYER
================================ */
function stopAndResetPlayer() {
  try {
    player.pause();
    player.removeAttribute("src");
    player.load();
  } catch (err) {
    console.warn("Player reset failed:", err);
  }
}

/* ===============================
   CLOSE MODAL
================================ */
function closePlayer() {
  stopAndResetPlayer();
  modal.classList.add("hidden");
  modalOpen = false;
}

/* ===============================
   CLICK OUTSIDE TO CLOSE
================================ */
modal.addEventListener("click", e => {
  if (e.target === modal) {
    closePlayer();
  }
});

/* ===============================
   ESC KEY TO CLOSE
================================ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && modalOpen) {
    closePlayer();
  }
});

/* ===============================
   VIDEO ERROR HANDLING
================================ */
player.addEventListener("error", () => {
  showError("Video playback error");
  closePlayer();
});

/* ===============================
   INITIAL LOAD
================================ */
loadFolders();
