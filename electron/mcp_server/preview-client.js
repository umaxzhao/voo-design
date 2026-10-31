/** Executed only inside the isolated, read-only preview page. */
export function startPreview(copy) {
  const main = document.querySelector("main");
  const image = document.querySelector("img");
  const status = document.querySelector("#status");
  const fitButton = document.querySelector("#fit");
  fitButton.textContent = copy.fit;
  document.querySelector("#in").ariaLabel = copy.in;
  document.querySelector("#out").ariaLabel = copy.out;
  image.alt = copy.art;
  main.ariaLabel = copy.art;
  status.textContent = copy.loading;
  let scale = 1;
  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;
  let first = true;
  let stopped = false;
  let drag = null;
  let timer = null;
  let request = null;

  function draw() {
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }
  function fit() {
    if (!width || !height) return;
    scale = Math.min((innerWidth - 48) / width, (innerHeight - 96) / height);
    x = (innerWidth - width * scale) / 2;
    y = (innerHeight - height * scale) / 2;
    draw();
  }
  function zoom(factor, cx = innerWidth / 2, cy = innerHeight / 2) {
    const next = Math.min(16, Math.max(0.05, scale * factor));
    x = cx - (cx - x) * next / scale;
    y = cy - (cy - y) * next / scale;
    scale = next;
    draw();
  }
  fitButton.onclick = fit;
  document.querySelector("#in").onclick = () => zoom(1.2);
  document.querySelector("#out").onclick = () => zoom(1 / 1.2);
  main.onwheel = event => {
    event.preventDefault();
    zoom(Math.exp(-event.deltaY * 0.001), event.clientX, event.clientY);
  };
  main.onpointerdown = event => {
    if (drag || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    main.setPointerCapture(event.pointerId);
  };
  main.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    x += event.clientX - drag.x;
    y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    draw();
  };
  function cancel(event) {
    if (drag && event?.pointerId !== undefined && event.pointerId !== drag.id) return;
    if (drag && main.hasPointerCapture(drag.id)) main.releasePointerCapture(drag.id);
    drag = null;
  }
  main.onpointerup = cancel;
  main.onpointercancel = cancel;
  main.onlostpointercapture = cancel;
  addEventListener("blur", cancel);
  main.onkeydown = event => {
    if (event.key === "0") fit();
    else if (event.key === "+" || event.key === "=") zoom(1.2);
    else if (event.key === "-") zoom(1 / 1.2);
    else return;
    event.preventDefault();
  };
  addEventListener("resize", fit);

  async function refresh() {
    clearTimeout(timer);
    if (stopped || document.hidden || request) return;
    request = new AbortController();
    const timeout = setTimeout(() => request?.abort(), 12000);
    try {
      const result = await fetch(`${location.pathname}/snapshot`, {
        signal: request.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      });
      if (result.status === 410) {
        stopped = true;
        image.removeAttribute("src");
        status.textContent = copy.gone;
        return;
      }
      if (!result.ok) throw new Error("preview.unavailable");
      const data = await result.json();
      if (!data.dataUrl?.startsWith("data:image/png;base64,")) throw new Error("preview.invalid");
      image.src = data.dataUrl;
      width = data.width;
      height = data.height;
      status.textContent = copy.live;
      if (first) { first = false; fit(); }
    } catch {
      // Keep the last frame with an explicit offline state; retry on recovery.
      if (!document.hidden) status.textContent = copy.retry;
    } finally {
      clearTimeout(timeout);
      request = null;
      if (!stopped && !document.hidden) timer = setTimeout(refresh, 1500);
    }
  }
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    if (document.hidden) request?.abort();
    else void refresh();
  });
  addEventListener("pagehide", () => {
    stopped = true;
    clearTimeout(timer);
    request?.abort();
    cancel();
  });
  void refresh();
}
