const params = new URLSearchParams(window.location.search);
const site = params.get("site");
const action = params.get("action");

const domainEl = document.getElementById("domain");
const phraseEl = document.getElementById("phrase");
const inputEl = document.getElementById("input");
const feedbackEl = document.getElementById("feedback");
const statusEl = document.getElementById("status");

let unlockPhrase = "";

function escapeHtml(char) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return map[char] || char;
}

domainEl.textContent = site || "";

if (action === "remove") {
  document.querySelector("h1").textContent = "Remove Site";
  document.querySelector(".instruction").textContent =
    "Type the phrase below exactly to remove " + site + " from your blocklist.";
} else if (action === "changePhrase") {
  document.querySelector("h1").textContent = "Change Phrase";
  domainEl.textContent = "";
  document.querySelector(".instruction").textContent =
    "Type your current phrase to confirm the change.";
} else if (action === "changeDays") {
  document.querySelector("h1").textContent = "Change Active Days";
  domainEl.textContent = "";
  document.querySelector(".instruction").textContent =
    "Type your current phrase to confirm the schedule change.";
}

fetch("arcnext-block://blocked/api/phrase")
  .then(r => r.json())
  .then(d => {
    unlockPhrase = d.phrase;
    phraseEl.textContent = unlockPhrase;
    renderFeedback();
  });

inputEl.addEventListener("paste", e => e.preventDefault());
inputEl.addEventListener("drop", e => e.preventDefault());
inputEl.addEventListener("contextmenu", e => e.preventDefault());

inputEl.addEventListener("input", () => {
  renderFeedback();
  checkMatch();
});

function renderFeedback() {
  const typed = inputEl.value;
  let html = "";
  for (let i = 0; i < unlockPhrase.length; i++) {
    if (i < typed.length) {
      if (typed[i] === unlockPhrase[i]) {
        html += '<span class="correct">' + escapeHtml(unlockPhrase[i]) + "</span>";
      } else if (unlockPhrase[i] === " ") {
        html += '<span class="incorrect space-error">&middot;</span>';
      } else {
        html += '<span class="incorrect">' + escapeHtml(unlockPhrase[i]) + "</span>";
      }
    } else {
      html += '<span class="remaining">' + escapeHtml(unlockPhrase[i]) + "</span>";
    }
  }
  feedbackEl.innerHTML = html;
}

function checkMatch() {
  if (inputEl.value !== unlockPhrase) return;
  inputEl.disabled = true;

  if (action === "changePhrase") {
    fetch("arcnext-block://blocked/api/apply-pending-phrase")
      .then(() => {
        statusEl.textContent = "Phrase updated!";
        statusEl.className = "status success";
      });
  } else if (action === "changeDays") {
    fetch("arcnext-block://blocked/api/apply-pending-days")
      .then(() => {
        statusEl.textContent = "Schedule updated!";
        statusEl.className = "status success";
      });
  } else if (action === "remove") {
    fetch("arcnext-block://blocked/api/remove?site=" + encodeURIComponent(site))
      .then(() => {
        statusEl.textContent = "Removed!";
        statusEl.className = "status success";
      });
  } else {
    fetch("arcnext-block://blocked/api/unlock?site=" + encodeURIComponent(site))
      .then(() => {
        statusEl.textContent = "Unlocked! Redirecting...";
        statusEl.className = "status success";
        setTimeout(() => {
          window.location.href = "https://" + site;
        }, 600);
      });
  }
}
