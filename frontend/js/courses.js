let allCourses = [];
let myCourseIds = [];
let currentUser = null;
let activeLevel = "All";

document.addEventListener("DOMContentLoaded", () => {
  init();

  const searchInput = document.getElementById("course-search");
  if (searchInput) {
    searchInput.addEventListener("input", renderCourses);
  }

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeLevel = chip.dataset.level;
      renderCourses();
    });
  });
});

async function init() {
  try {
    const res = await fetch(API_BASE + "/api/session", { credentials: "include" });
    const data = await res.json();
    currentUser = data.user;
  } catch (err) {
    currentUser = null;
  }

  if (currentUser && currentUser.role === "student") {
    try {
      const res = await fetch(API_BASE + "/api/my-courses", { credentials: "include" });
      const courses = await res.json();
      myCourseIds = courses.map(c => c.id);
    } catch (err) {
      myCourseIds = [];
    }
  }

  loadCourses();
}

async function loadCourses() {
  try {
    const res = await fetch(API_BASE + "/api/courses");
    if (!res.ok) throw new Error("Request failed: " + res.status);
    allCourses = await res.json();
  } catch (err) {
    console.warn("Courses unavailable, using fallback list:", err.message);
    allCourses = [
      { id: 1, title: "IoT & Home Automation", description: "Build connected devices and automate homes using sensors and microcontrollers.", level: "Intermediate", duration_weeks: 4, fee_kes: 2000 },
      { id: 2, title: "PCB Design", description: "Design and lay out printed circuit boards for real electronics projects.", level: "Intermediate", duration_weeks: 4, fee_kes: 2000 },
      { id: 3, title: "CCTV & Systems Installation", description: "Install and configure CCTV and security systems from the ground up.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 4, title: "Graphics Design", description: "Learn design fundamentals and industry-standard design tools.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 5, title: "Web Development", description: "Build websites and web apps with HTML, CSS, JavaScript and backend basics.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 6, title: "Research & Technical Writing", description: "Structure, write and edit technical documents and research reports.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 7, title: "AI For Everyone", description: "An accessible introduction to how AI works and how to use it well.", level: "Beginner", duration_weeks: 4, fee_kes: null }
    ];
  }
  renderCourses();
}

function renderCourses() {
  const grid = document.getElementById("course-grid");
  const searchInput = document.getElementById("course-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  let filtered = allCourses.filter(c => {
    const matchesLevel = activeLevel === "All" || c.level === activeLevel;
    const matchesSearch = c.title.toLowerCase().includes(query) || (c.description || "").toLowerCase().includes(query);
    return matchesLevel && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = "<div class=\"empty-state\">No courses match your search. Try a different keyword or filter.</div>";
    return;
  }

  grid.innerHTML = filtered.map(courseCardHtml).join("");

  grid.querySelectorAll(".enroll-btn").forEach(btn => {
    btn.addEventListener("click", () => handleEnroll(btn));
  });
}

function formatFee(fee_kes) {
  if (fee_kes === null || fee_kes === undefined) {
    return "<span class=\"fee-badge fee-free\">Free</span>";
  }
  return "<span class=\"fee-badge\">KES " + Number(fee_kes).toLocaleString() + "</span>";
}

function actionButtonHtml(c) {
  if (!currentUser) {
    return "<a href=\"login.html\" class=\"btn btn-ghost\" style=\"padding:6px 12px;font-size:12.5px;\">Log in to enroll</a>";
  }
  if (currentUser.role !== "student") {
    return "<a href=\"contact.html\" class=\"btn btn-ghost\" style=\"padding:6px 12px;font-size:12.5px;\">Enquire</a>";
  }
  if (myCourseIds.includes(c.id)) {
    return "<span class=\"status-badge paid\" style=\"padding:7px 12px;\">Enrolled</span>";
  }
  return "<button class=\"btn btn-primary enroll-btn\" data-course-id=\"" + c.id + "\" style=\"padding:6px 12px;font-size:12.5px;\">Enroll</button>";
}

function courseCardHtml(c) {
  return (
    "<div class=\"card course-card\">" +
      "<div class=\"course-card__top\">" +
        "<h3>" + escapeHtml(c.title) + "</h3>" +
        "<span class=\"level-badge " + c.level + "\">" + c.level + "</span>" +
      "</div>" +
      "<p>" + escapeHtml(c.description || "") + "</p>" +
      "<div class=\"course-card__meta\">" +
        "<span class=\"duration\">" + Math.round(c.duration_weeks / 4) + " month" + (Math.round(c.duration_weeks / 4) === 1 ? "" : "s") + "</span>" +
        formatFee(c.fee_kes) +
        actionButtonHtml(c) +
      "</div>" +
    "</div>"
  );
}

async function handleEnroll(btn) {
  const courseId = Number(btn.dataset.courseId);
  btn.disabled = true;
  btn.textContent = "Enrolling...";

  try {
    const res = await fetch(API_BASE + "/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ course_id: courseId })
    });
    const data = await res.json();

    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = "Enroll";
      alert(data.error || "Could not enroll right now.");
      return;
    }

    myCourseIds.push(courseId);
    renderCourses();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Enroll";
    alert("Could not reach the server. Please try again.");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
