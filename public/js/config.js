const formatSelect = document.getElementById("formatSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const statusText = document.getElementById("configStatus");

/* LOAD CURRENT CONFIG + CAPABILITIES */
async function loadConfig() {
  try {
    const res = await fetch("/api/camera/config");
    const data = await res.json();

    // Clear
    formatSelect.innerHTML = "";
    resolutionSelect.innerHTML = "";
    fpsSelect.innerHTML = "";

    // Populate FORMAT
    data.capabilities.formats.forEach(f => {
      const opt = new Option(f, f);
      if (f === data.current.format) opt.selected = true;
      formatSelect.add(opt);
    });

    // Populate RESOLUTION
    data.capabilities.resolutions.forEach(r => {
      const opt = new Option(r, r);
      if (r === data.current.resolution) opt.selected = true;
      resolutionSelect.add(opt);
    });

    // Populate FPS
    data.capabilities.fps.forEach(fps => {
      const opt = new Option(fps, fps);
      if (fps === data.current.fps) opt.selected = true;
      fpsSelect.add(opt);
    });

  } catch {
    statusText.textContent = "Failed to load configuration";
    statusText.className = "status-text error";
  }
}



/* SAVE CONFIG */
document.getElementById("configForm").onsubmit = async e => {
  e.preventDefault();

  statusText.textContent = "Saving...";
  statusText.className = "status-text";

  const payload = {
    format: formatSelect.value,
    resolution: resolutionSelect.value,
    fps: fpsSelect.value
  };

  const res = await fetch("/api/camera/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (res.ok) {
    statusText.textContent = "CONFIGURATION SUCCESSFUL";
    statusText.className = "status-text success";
  } else {
    statusText.textContent = data.error || "CONFIGURATION FAILED";
    statusText.className = "status-text error";
  }
};

loadConfig();
