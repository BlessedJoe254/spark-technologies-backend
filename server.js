require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const multer = require("multer");
const pool = require("./config/db");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const app = express();
const PORT = process.env.PORT || 3000;

const TRAINER_CODE = "T38484692T";
const ADMIN_EMAIL = "sparktech511@gmail.com";
const ADMIN_NAME = "Blessed Joe";
const ADMIN_PASSWORD = "38484692A";

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const projectImagesDir = path.join(__dirname, "project-images");
if (!fs.existsSync(projectImagesDir)) fs.mkdirSync(projectImagesDir);
const projectStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, projectImagesDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const projectUpload = multer({ storage: projectStorage, limits: { fileSize: 8 * 1024 * 1024 } });

const teamImagesDir = path.join(__dirname, "team-images");
if (!fs.existsSync(teamImagesDir)) fs.mkdirSync(teamImagesDir);
const teamStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, teamImagesDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const teamUpload = multer({ storage: teamStorage, limits: { fileSize: 8 * 1024 * 1024 } });

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "spark-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, secure: true, sameSite: "lax" }
}));
const frontendPath = path.join(__dirname, "frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}
app.use("/project-images", express.static(projectImagesDir));
app.use("/team-images", express.static(teamImagesDir));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Please log in." });
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).json({ error: "You are not authorized to do that." });
    }
    next();
  };
}

const dns = require("dns");

let mailTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

dns.resolve4("smtp.gmail.com", (err, addresses) => {
  if (!err && addresses && addresses.length > 0) {
    console.log("Resolved smtp.gmail.com to IPv4:", addresses[0]);
    mailTransporter = nodemailer.createTransport({
      host: addresses[0],
      port: 465,
      secure: true,
      tls: {
        servername: "smtp.gmail.com"
      },
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  } else {
    console.log("Could not resolve smtp.gmail.com to IPv4, using default transporter. Error:", err);
  }
});

async function ensurePasswordResetTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS password_resets (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "user_id INT NOT NULL, " +
      "code VARCHAR(6) NOT NULL, " +
      "expires_at TIMESTAMP NOT NULL, " +
      "used BOOLEAN DEFAULT FALSE, " +
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
      "INDEX (user_id, code)" +
      ")"
    );
  } catch (err) {
    console.warn("Could not verify/create password_resets table (is MySQL running?):", err.message);
  }
}

async function ensureContactTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS contact_messages (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "name VARCHAR(150) NOT NULL, " +
      "email VARCHAR(150) NOT NULL, " +
      "subject VARCHAR(200), " +
      "message TEXT NOT NULL, " +
      "is_read BOOLEAN DEFAULT FALSE, " +
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );
  } catch (err) {
    console.warn("Could not verify/create contact_messages table (is MySQL running?):", err.message);
  }
}

async function ensureTeamTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS team_members (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "full_name VARCHAR(150) NOT NULL, " +
      "role_title TEXT, " +
      "image_filename VARCHAR(255), " +
      "sort_order INT DEFAULT 0, " +
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
      ")"
    );
  } catch (err) {
    console.warn("Could not verify/create team_members table (is MySQL running?):", err.message);
  }
}

async function ensureAdminAccount() {
  try {
    const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [ADMIN_EMAIL]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.query(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
        [ADMIN_NAME, ADMIN_EMAIL, hash]
      );
      console.log("Admin account created:", ADMIN_EMAIL);
    }
  } catch (err) {
    console.warn("Could not verify/create admin account (is MySQL running?):", err.message);
  }
}

app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const [[{ courseCount }]] = await pool.query("SELECT COUNT(*) AS courseCount FROM courses");
    const [[{ projectCount }]] = await pool.query("SELECT COUNT(*) AS projectCount FROM projects");
    const [[{ studentCount }]] = await pool.query("SELECT COUNT(*) AS studentCount FROM users WHERE role = 'student'");
    const [[{ messageCount }]] = await pool.query("SELECT COUNT(*) AS messageCount FROM contact_messages WHERE is_read = FALSE");
    res.json({ courses: courseCount, projects: projectCount, students: studentCount, messages: messageCount });
  } catch (err) {
    console.warn("Dashboard stats: database not reachable, sending mock data.", err.message);
    res.json({ courses: 7, projects: 3, students: 12, messages: 2 });
  }
});

app.get("/api/courses", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, title, description, level, duration_weeks, fee_kes FROM courses " +
      "ORDER BY FIELD(level, 'Beginner', 'Intermediate', 'Advanced'), title"
    );
    res.json(rows);
  } catch (err) {
    console.warn("Courses: database not reachable, sending mock data.", err.message);
    res.json([
      { id: 1, title: "IoT & Home Automation", description: "Build connected devices and automate homes using sensors and microcontrollers.", level: "Intermediate", duration_weeks: 4, fee_kes: 2000 },
      { id: 2, title: "PCB Design", description: "Design and lay out printed circuit boards for real electronics projects.", level: "Intermediate", duration_weeks: 4, fee_kes: 2000 },
      { id: 3, title: "CCTV & Systems Installation", description: "Install and configure CCTV and security systems from the ground up.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 4, title: "Graphics Design", description: "Learn design fundamentals and industry-standard design tools.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 5, title: "Web Development", description: "Build websites and web apps with HTML, CSS, JavaScript and backend basics.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 6, title: "Research & Technical Writing", description: "Structure, write and edit technical documents and research reports.", level: "Beginner", duration_weeks: 4, fee_kes: 2000 },
      { id: 7, title: "AI For Everyone", description: "An accessible introduction to how AI works and how to use it well.", level: "Beginner", duration_weeks: 4, fee_kes: null }
    ]);
  }
});

// ---------- Auth ----------
app.post("/api/register", async (req, res) => {
  try {
    const { full_name, email, phone, role, trainer_code, password } = req.body;

    if (!full_name || !email || !phone || !password || !role) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!["student", "trainer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role selected." });
    }
    if (role === "trainer" && trainer_code !== TRAINER_CODE) {
      return res.status(403).json({ error: "Invalid trainer invite code." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [full_name, email, phone, password_hash, role]
    );

    req.session.user = { id: result.insertId, full_name, email, role };
    logActivity(result.insertId, full_name, "register", full_name + " joined Spark Technologies as a " + role + ".");
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Could not connect to the database. Please make sure MySQL is running." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const [rows] = await pool.query(
      "SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE email = ?",
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (user.is_active === 0) {
      return res.status(403).json({ error: "This account has been deactivated. Please contact the admin." });
    }

    req.session.user = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Could not connect to the database. Please make sure MySQL is running." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/session", async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  try {
    const [[row]] = await pool.query("SELECT is_active FROM users WHERE id = ?", [req.session.user.id]);
    if (!row || row.is_active === 0) {
      req.session.destroy(() => res.json({ user: null }));
      return;
    }
    res.json({ user: req.session.user });
  } catch (err) {
    res.json({ user: req.session.user });
  }
});

// ---------- Student: enroll + my courses + payment submission ----------
app.post("/api/enroll", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: "Course is required." });

    await pool.query(
      "INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)",
      [req.session.user.id, course_id]
    );
    const [[enrolledCourse]] = await pool.query("SELECT title FROM courses WHERE id = ?", [course_id]);
    logActivity(req.session.user.id, req.session.user.full_name, "enroll", req.session.user.full_name + " enrolled in " + (enrolledCourse ? enrolledCourse.title : "a course") + ".");
    res.json({ success: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "You are already enrolled in this course." });
    }
    console.error("Enroll error:", err.message);
    res.status(500).json({ error: "Could not enroll right now. Please make sure MySQL is running." });
  }
});

const MAX_SESSIONS = 10;

app.get("/api/my-courses", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const [rows] = await pool.query(
      "SELECT c.id, c.title, c.level, c.duration_weeks, c.fee_kes, e.has_paid, e.payment_code " +
      "FROM enrollments e JOIN courses c ON c.id = e.course_id " +
      "WHERE e.user_id = ? ORDER BY e.enrolled_at DESC",
      [studentId]
    );

    const unlockedIds = rows.filter(r => r.has_paid || r.fee_kes === null).map(r => r.id);

    let notesByCourse = {}, linksByCourse = {}, sessionsByCourse = {}, attendanceByCourse = {}, scoresByCourse = {};

    if (unlockedIds.length > 0) {
      const [noteRows] = await pool.query(
        "SELECT id, course_id, title, original_filename FROM notes WHERE course_id IN (?) ORDER BY uploaded_at DESC",
        [unlockedIds]
      );
      noteRows.forEach(n => {
        if (!notesByCourse[n.course_id]) notesByCourse[n.course_id] = [];
        notesByCourse[n.course_id].push({ id: n.id, title: n.title, original_filename: n.original_filename });
      });

      const [linkRows] = await pool.query(
        "SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) ORDER BY created_at",
        [unlockedIds]
      );
      linkRows.forEach(l => {
        if (!linksByCourse[l.course_id]) linksByCourse[l.course_id] = [];
        linksByCourse[l.course_id].push({ id: l.id, title: l.title, url: l.url });
      });

      const [sessionRows] = await pool.query(
        "SELECT id, course_id, session_number, held_on FROM class_sessions WHERE course_id IN (?) ORDER BY session_number",
        [unlockedIds]
      );
      sessionRows.forEach(s => {
        if (!sessionsByCourse[s.course_id]) sessionsByCourse[s.course_id] = [];
        sessionsByCourse[s.course_id].push({ id: s.id, session_number: s.session_number, held_on: s.held_on });
      });

      const sessionIds = sessionRows.map(s => s.id);
      let attendanceRows = [];
      if (sessionIds.length > 0) {
        [attendanceRows] = await pool.query(
          "SELECT session_id, present FROM attendance WHERE session_id IN (?) AND student_id = ?",
          [sessionIds, studentId]
        );
      }
      const attendanceBySession = {};
      attendanceRows.forEach(a => { attendanceBySession[a.session_id] = !!a.present; });

      Object.keys(sessionsByCourse).forEach(courseId => {
        const sessions = sessionsByCourse[courseId].map(s => ({
          session_number: s.session_number,
          held_on: s.held_on,
          present: attendanceBySession[s.id] === true
        }));
        const attended = sessions.filter(s => s.present).length;
        attendanceByCourse[courseId] = { attended, total: MAX_SESSIONS, sessions };
      });

      const [scoreRows] = await pool.query(
        "SELECT course_id, assessment_type, score, max_score FROM assessment_scores WHERE course_id IN (?) AND student_id = ?",
        [unlockedIds, studentId]
      );
      scoreRows.forEach(s => {
        if (!scoresByCourse[s.course_id]) scoresByCourse[s.course_id] = {};
        scoresByCourse[s.course_id][s.assessment_type] = { score: Number(s.score), max_score: Number(s.max_score) };
      });
    }

    const result = rows.map(r => {
      const unlocked = !!r.has_paid || r.fee_kes === null;
      return {
        id: r.id,
        title: r.title,
        level: r.level,
        duration_weeks: r.duration_weeks,
        fee_kes: r.fee_kes,
        has_paid: !!r.has_paid,
        payment_code: r.payment_code,
        unlocked,
        class_links: unlocked ? (linksByCourse[r.id] || []) : [],
        notes: unlocked ? (notesByCourse[r.id] || []) : [],
        attendance: unlocked ? (attendanceByCourse[r.id] || { attended: 0, total: MAX_SESSIONS, sessions: [] }) : null,
        scores: unlocked ? {
          cat1: (scoresByCourse[r.id] && scoresByCourse[r.id].cat1) || null,
          cat2: (scoresByCourse[r.id] && scoresByCourse[r.id].cat2) || null,
          final: (scoresByCourse[r.id] && scoresByCourse[r.id].final) || null
        } : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error("My-courses error:", err.message);
    res.json([]);
  }
});

app.post("/api/submit-payment", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const { course_id, payment_code } = req.body;
    if (!course_id || !payment_code) {
      return res.status(400).json({ error: "Course and M-Pesa code are required." });
    }
    const [result] = await pool.query(
      "UPDATE enrollments SET payment_code = ? WHERE user_id = ? AND course_id = ?",
      [payment_code, req.session.user.id, course_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Enrollment not found." });
    }
    logActivity(req.session.user.id, req.session.user.full_name, "payment_submitted", req.session.user.full_name + " submitted a payment code for review.");
    res.json({ success: true });
  } catch (err) {
    console.error("Submit payment error:", err.message);
    res.status(500).json({ error: "Could not submit your payment code right now." });
  }
});

// ---------- Trainer: students, class links, sessions, attendance, scores, notes ----------
app.get("/api/trainer/students", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const trainerId = req.session.user.id;
    const [rows] = await pool.query(
      "SELECT c.id AS course_id, c.title AS course_title, u.id AS student_id, u.full_name, u.phone, e.has_paid " +
      "FROM courses c " +
      "LEFT JOIN enrollments e ON e.course_id = c.id " +
      "LEFT JOIN users u ON u.id = e.user_id " +
      "WHERE c.trainer_id = ? ORDER BY c.title, u.full_name",
      [trainerId]
    );

    const groups = {};
    rows.forEach(r => {
      if (!groups[r.course_id]) {
        groups[r.course_id] = { course_id: r.course_id, course_title: r.course_title, students: [], notes: [], class_links: [], sessions_count: 0 };
      }
      if (r.student_id) {
        groups[r.course_id].students.push({ id: r.student_id, full_name: r.full_name, phone: r.phone, has_paid: !!r.has_paid, attended: 0, scores: { cat1: null, cat2: null, final: null } });
      }
    });

    const courseIds = Object.keys(groups).map(Number);
    if (courseIds.length > 0) {
      const [noteRows] = await pool.query(
        "SELECT id, course_id, title, original_filename FROM notes WHERE course_id IN (?) ORDER BY uploaded_at DESC",
        [courseIds]
      );
      noteRows.forEach(n => { if (groups[n.course_id]) groups[n.course_id].notes.push({ id: n.id, title: n.title, original_filename: n.original_filename }); });

      const [linkRows] = await pool.query(
        "SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) ORDER BY created_at",
        [courseIds]
      );
      linkRows.forEach(l => { if (groups[l.course_id]) groups[l.course_id].class_links.push({ id: l.id, title: l.title, url: l.url }); });

      const [sessionRows] = await pool.query(
        "SELECT id, course_id FROM class_sessions WHERE course_id IN (?)",
        [courseIds]
      );
      sessionRows.forEach(s => { if (groups[s.course_id]) groups[s.course_id].sessions_count++; });

      const sessionIds = sessionRows.map(s => s.id);
      if (sessionIds.length > 0) {
        const [attRows] = await pool.query(
          "SELECT a.student_id, cs.course_id FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id WHERE a.session_id IN (?) AND a.present = 1",
          [sessionIds]
        );
        attRows.forEach(a => {
          const g = groups[a.course_id];
          if (g) {
            const s = g.students.find(st => st.id === a.student_id);
            if (s) s.attended++;
          }
        });
      }

      const [scoreRows] = await pool.query(
        "SELECT course_id, student_id, assessment_type, score, max_score FROM assessment_scores WHERE course_id IN (?)",
        [courseIds]
      );
      scoreRows.forEach(sc => {
        const g = groups[sc.course_id];
        if (g) {
          const s = g.students.find(st => st.id === sc.student_id);
          if (s) s.scores[sc.assessment_type] = { score: Number(sc.score), max_score: Number(sc.max_score) };
        }
      });
    }

    res.json(Object.values(groups));
  } catch (err) {
    console.error("Trainer students error:", err.message);
    res.json([]);
  }
});

async function assertOwnsCourse(trainerId, courseId) {
  const [[course]] = await pool.query("SELECT trainer_id FROM courses WHERE id = ?", [courseId]);
  return course && course.trainer_id === trainerId;
}

app.post("/api/trainer/class-links", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const { course_id, title, url } = req.body;
    if (!course_id || !title || !url) return res.status(400).json({ error: "Course, title and URL are all required." });
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) return res.status(403).json({ error: "This is not your course." });

    await pool.query("INSERT INTO class_links (course_id, title, url) VALUES (?, ?, ?)", [course_id, title, url]);
    res.json({ success: true });
  } catch (err) {
    console.error("Add class link error:", err.message);
    res.status(500).json({ error: "Could not save the link right now." });
  }
});

app.post("/api/trainer/sessions", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: "Course is required." });
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) return res.status(403).json({ error: "This is not your course." });

    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM class_sessions WHERE course_id = ?", [course_id]);
    if (cnt >= MAX_SESSIONS) return res.status(400).json({ error: "This course has already reached the maximum of 10 classes." });

    const [enrolled] = await pool.query("SELECT user_id FROM enrollments WHERE course_id = ?", [course_id]);

    const [result] = await pool.query(
      "INSERT INTO class_sessions (course_id, session_number, held_on) VALUES (?, ?, CURDATE())",
      [course_id, cnt + 1]
    );

    const [[sessionCourse]] = await pool.query("SELECT title FROM courses WHERE id = ?", [course_id]);
    logActivity(req.session.user.id, req.session.user.full_name, "class_recorded", req.session.user.full_name + " recorded class " + (cnt + 1) + " for " + (sessionCourse ? sessionCourse.title : "a course") + ".");

    res.json({
      success: true,
      session: { id: result.insertId, session_number: cnt + 1 },
      students: enrolled.map(e => e.user_id)
    });
  } catch (err) {
    console.error("Create session error:", err.message);
    res.status(500).json({ error: "Could not create the class session right now." });
  }
});

app.post("/api/trainer/attendance", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const { session_id, records } = req.body;
    if (!session_id || !Array.isArray(records)) return res.status(400).json({ error: "Session and attendance records are required." });

    const [[session]] = await pool.query(
      "SELECT cs.id, c.trainer_id FROM class_sessions cs JOIN courses c ON c.id = cs.course_id WHERE cs.id = ?",
      [session_id]
    );
    if (!session || session.trainer_id !== req.session.user.id) return res.status(403).json({ error: "This is not your class session." });

    for (const r of records) {
      await pool.query(
        "INSERT INTO attendance (session_id, student_id, present) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE present = VALUES(present)",
        [session_id, r.student_id, r.present ? 1 : 0]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Attendance error:", err.message);
    res.status(500).json({ error: "Could not save attendance right now." });
  }
});

app.post("/api/trainer/scores", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const { course_id, student_id, assessment_type, score } = req.body;
    if (!course_id || !student_id || !["cat1", "cat2", "final"].includes(assessment_type) || score === undefined || score === null || score === "") {
      return res.status(400).json({ error: "Course, student, assessment type and score are all required." });
    }
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) return res.status(403).json({ error: "This is not your course." });

    await pool.query(
      "INSERT INTO assessment_scores (course_id, student_id, assessment_type, score, max_score) VALUES (?, ?, ?, ?, 100) " +
      "ON DUPLICATE KEY UPDATE score = VALUES(score)",
      [course_id, student_id, assessment_type, score]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Score save error:", err.message);
    res.status(500).json({ error: "Could not save the score right now." });
  }
});

app.post("/api/trainer/notes", requireLogin, requireRole("trainer"), upload.single("file"), async (req, res) => {
  try {
    const { course_id, title } = req.body;
    if (!course_id || !title || !req.file) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Course, title and a file are all required." });
    }
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "This is not your course." });
    }

    await pool.query(
      "INSERT INTO notes (course_id, title, original_filename, stored_filename) VALUES (?, ?, ?, ?)",
      [course_id, title, req.file.originalname, req.file.filename]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Notes upload error:", err.message);
    res.status(500).json({ error: "Could not upload the note right now." });
  }
});

app.get("/api/notes/:id/download", requireLogin, async (req, res) => {
  try {
    const [[note]] = await pool.query(
      "SELECT n.id, n.course_id, n.original_filename, n.stored_filename, c.trainer_id, c.fee_kes " +
      "FROM notes n JOIN courses c ON c.id = n.course_id WHERE n.id = ?",
      [req.params.id]
    );
    if (!note) return res.status(404).json({ error: "Note not found." });

    const user = req.session.user;
    let allowed = false;

    if (user.role === "admin") allowed = true;
    else if (user.role === "trainer" && note.trainer_id === user.id) allowed = true;
    else if (user.role === "student") {
      const [[enr]] = await pool.query("SELECT has_paid FROM enrollments WHERE user_id = ? AND course_id = ?", [user.id, note.course_id]);
      if (enr && (enr.has_paid || note.fee_kes === null)) allowed = true;
    }

    if (!allowed) return res.status(403).json({ error: "You do not have access to this file." });

    const filePath = path.join(uploadsDir, note.stored_filename);
    res.download(filePath, note.original_filename);
  } catch (err) {
    console.error("Download error:", err.message);
    res.status(500).json({ error: "Could not download this file right now." });
  }
});

// ---------- Admin: full visibility across trainers and students ----------
app.get("/api/admin/overview", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT t.id AS trainer_id, t.full_name AS trainer_name, t.phone AS trainer_phone, " +
      "c.id AS course_id, c.title AS course_title, " +
      "s.id AS student_id, s.full_name AS student_name, s.phone AS student_phone, e.has_paid " +
      "FROM users t " +
      "LEFT JOIN courses c ON c.trainer_id = t.id " +
      "LEFT JOIN enrollments e ON e.course_id = c.id " +
      "LEFT JOIN users s ON s.id = e.user_id " +
      "WHERE t.role = 'trainer' " +
      "ORDER BY t.full_name, c.title, s.full_name"
    );

    const trainers = {};
    const courseIds = new Set();
    rows.forEach(r => {
      if (!trainers[r.trainer_id]) trainers[r.trainer_id] = { id: r.trainer_id, full_name: r.trainer_name, phone: r.trainer_phone, courses: {} };
      if (r.course_id) {
        courseIds.add(r.course_id);
        if (!trainers[r.trainer_id].courses[r.course_id]) {
          trainers[r.trainer_id].courses[r.course_id] = { course_id: r.course_id, course_title: r.course_title, class_links: [], students: [] };
        }
        if (r.student_id) {
          trainers[r.trainer_id].courses[r.course_id].students.push({
            id: r.student_id, full_name: r.student_name, phone: r.student_phone, has_paid: !!r.has_paid,
            attended: 0, scores: { cat1: null, cat2: null, final: null }
          });
        }
      }
    });

    const courseIdList = Array.from(courseIds);
    if (courseIdList.length > 0) {
      const [linkRows] = await pool.query("SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) ORDER BY created_at", [courseIdList]);
      linkRows.forEach(l => {
        Object.values(trainers).forEach(t => { if (t.courses[l.course_id]) t.courses[l.course_id].class_links.push({ id: l.id, title: l.title, url: l.url }); });
      });

      const [sessionRows] = await pool.query("SELECT id, course_id FROM class_sessions WHERE course_id IN (?)", [courseIdList]);
      const sessionIds = sessionRows.map(s => s.id);
      if (sessionIds.length > 0) {
        const [attRows] = await pool.query(
          "SELECT a.student_id, cs.course_id FROM attendance a JOIN class_sessions cs ON cs.id = a.session_id WHERE a.session_id IN (?) AND a.present = 1",
          [sessionIds]
        );
        attRows.forEach(a => {
          Object.values(trainers).forEach(t => {
            const c = t.courses[a.course_id];
            if (c) { const s = c.students.find(st => st.id === a.student_id); if (s) s.attended++; }
          });
        });
      }

      const [scoreRows] = await pool.query("SELECT course_id, student_id, assessment_type, score, max_score FROM assessment_scores WHERE course_id IN (?)", [courseIdList]);
      scoreRows.forEach(sc => {
        Object.values(trainers).forEach(t => {
          const c = t.courses[sc.course_id];
          if (c) { const s = c.students.find(st => st.id === sc.student_id); if (s) s.scores[sc.assessment_type] = { score: Number(sc.score), max_score: Number(sc.max_score) }; }
        });
      });
    }

    const result = Object.values(trainers).map(t => ({ id: t.id, full_name: t.full_name, phone: t.phone, courses: Object.values(t.courses) }));
    res.json(result);
  } catch (err) {
    console.error("Admin overview error:", err.message);
    res.json([]);
  }
});

app.get("/api/admin/pending-payments", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT e.id AS enrollment_id, u.full_name, u.phone, c.title AS course_title, e.payment_code " +
      "FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id " +
      "WHERE e.payment_code IS NOT NULL AND e.has_paid = FALSE ORDER BY e.enrolled_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Pending payments error:", err.message);
    res.json([]);
  }
});

app.post("/api/admin/mark-paid", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { enrollment_id } = req.body;
    if (!enrollment_id) return res.status(400).json({ error: "Enrollment is required." });
    await pool.query("UPDATE enrollments SET has_paid = TRUE WHERE id = ?", [enrollment_id]);
    const [[paidInfo]] = await pool.query(
      "SELECT u.full_name AS student_name, c.title AS course_title FROM enrollments e " +
      "JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id WHERE e.id = ?",
      [enrollment_id]
    );
    if (paidInfo) {
      logActivity(req.session.user.id, req.session.user.full_name, "payment_confirmed", paidInfo.student_name + "'s payment for " + paidInfo.course_title + " was confirmed.");
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Mark paid error:", err.message);
    res.status(500).json({ error: "Could not update payment status right now." });
  }
});

app.get("/api/admin/courses", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, title, level, fee_kes, trainer_id FROM courses " +
      "ORDER BY FIELD(level, 'Beginner', 'Intermediate', 'Advanced'), title"
    );
    res.json(rows);
  } catch (err) { res.json([]); }
});

app.get("/api/admin/trainers", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, full_name FROM users WHERE role = 'trainer' ORDER BY full_name");
    res.json(rows);
  } catch (err) { res.json([]); }
});

app.post("/api/admin/assign-trainer", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { course_id, trainer_id } = req.body;
    if (!course_id) return res.status(400).json({ error: "Course is required." });
    await pool.query("UPDATE courses SET trainer_id = ? WHERE id = ?", [trainer_id || null, course_id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Assign trainer error:", err.message);
    res.status(500).json({ error: "Could not save assignment right now." });
  }
});

// ---------- Earnings: trainer commission, company share, tax ----------
const TRAINER_SHARE = 0.50;
const COMPANY_SHARE = 0.35;
const TAX_SHARE = 0.15;

function computeShares(totalCollected) {
  const trainer_share = Math.round(totalCollected * TRAINER_SHARE * 100) / 100;
  const company_share = Math.round(totalCollected * COMPANY_SHARE * 100) / 100;
  const tax_share = Math.round(totalCollected * TAX_SHARE * 100) / 100;
  return { trainer_share, company_share, tax_share };
}

app.get("/api/trainer/earnings", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const trainerId = req.session.user.id;
    const [rows] = await pool.query(
      "SELECT c.id AS course_id, c.title AS course_title, c.fee_kes, COUNT(e.id) AS paid_count " +
      "FROM courses c JOIN enrollments e ON e.course_id = c.id " +
      "WHERE c.trainer_id = ? AND e.has_paid = TRUE AND c.fee_kes IS NOT NULL " +
      "GROUP BY c.id, c.title, c.fee_kes",
      [trainerId]
    );

    let totalCollected = 0, totalPaidStudents = 0;
    const perCourse = rows.map(r => {
      const collected = Number(r.fee_kes) * r.paid_count;
      totalCollected += collected;
      totalPaidStudents += r.paid_count;
      const shares = computeShares(collected);
      return {
        course_id: r.course_id,
        course_title: r.course_title,
        paid_count: r.paid_count,
        fee_kes: Number(r.fee_kes),
        collected,
        trainer_share: shares.trainer_share
      };
    });

    const overall = computeShares(totalCollected);

    res.json({
      trainer_share_pct: TRAINER_SHARE * 100,
      company_share_pct: COMPANY_SHARE * 100,
      tax_share_pct: TAX_SHARE * 100,
      total_collected: totalCollected,
      total_paid_students: totalPaidStudents,
      your_commission: overall.trainer_share,
      company_share: overall.company_share,
      tax_share: overall.tax_share,
      courses: perCourse
    });
  } catch (err) {
    console.error("Trainer earnings error:", err.message);
    res.status(500).json({ error: "Could not calculate earnings right now." });
  }
});

app.get("/api/admin/earnings", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT t.id AS trainer_id, t.full_name AS trainer_name, c.id AS course_id, c.fee_kes, COUNT(e.id) AS paid_count " +
      "FROM users t " +
      "JOIN courses c ON c.trainer_id = t.id " +
      "JOIN enrollments e ON e.course_id = c.id AND e.has_paid = TRUE " +
      "WHERE t.role = 'trainer' AND c.fee_kes IS NOT NULL " +
      "GROUP BY t.id, t.full_name, c.id, c.fee_kes"
    );

    const byTrainer = {};
    let grandTotal = 0;

    rows.forEach(r => {
      if (!byTrainer[r.trainer_id]) {
        byTrainer[r.trainer_id] = { trainer_id: r.trainer_id, trainer_name: r.trainer_name, total_collected: 0, paid_students: 0 };
      }
      const collected = Number(r.fee_kes) * r.paid_count;
      byTrainer[r.trainer_id].total_collected += collected;
      byTrainer[r.trainer_id].paid_students += r.paid_count;
      grandTotal += collected;
    });

    const trainers = Object.values(byTrainer).map(t => {
      const shares = computeShares(t.total_collected);
      return {
        trainer_id: t.trainer_id,
        trainer_name: t.trainer_name,
        paid_students: t.paid_students,
        total_collected: t.total_collected,
        owed_to_trainer: shares.trainer_share,
        company_share: shares.company_share,
        tax_share: shares.tax_share
      };
    });

    const grandShares = computeShares(grandTotal);

    res.json({
      trainer_share_pct: TRAINER_SHARE * 100,
      company_share_pct: COMPANY_SHARE * 100,
      tax_share_pct: TAX_SHARE * 100,
      total_collected: grandTotal,
      total_owed_to_trainers: grandShares.trainer_share,
      total_company_share: grandShares.company_share,
      total_tax: grandShares.tax_share,
      trainers
    });
  } catch (err) {
    console.error("Admin earnings error:", err.message);
    res.status(500).json({ error: "Could not calculate earnings right now." });
  }
});
// ---------- Activity log ----------
async function logActivity(actorId, actorName, actionType, description) {
  try {
    await pool.query(
      "INSERT INTO activity_log (actor_id, actor_name, action_type, description) VALUES (?, ?, ?, ?)",
      [actorId || null, actorName || null, actionType, description]
    );
  } catch (err) {
    console.warn("Could not log activity:", err.message);
  }
}

app.get("/api/activity/recent", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT action_type, description, created_at FROM activity_log ORDER BY created_at DESC LIMIT 10"
    );
    res.json(rows);
  } catch (err) {
    console.warn("Activity feed unavailable:", err.message);
    res.json([]);
  }
});

// ---------- Messaging: trainer -> student(s), admin -> trainer(s) ----------
app.post("/api/messages/send", requireLogin, async (req, res) => {
  try {
    const sender = req.session.user;
    const { recipient_type, recipient_id, course_id, subject, body } = req.body;
    if (!recipient_type || !subject || !body) {
      return res.status(400).json({ error: "Recipient, subject and message body are all required." });
    }

    let recipientIds = [];

    if (sender.role === "trainer") {
      if (recipient_type === "student") {
        if (!recipient_id) return res.status(400).json({ error: "Student is required." });
        const [[owns]] = await pool.query(
          "SELECT 1 AS ok FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND c.trainer_id = ? LIMIT 1",
          [recipient_id, sender.id]
        );
        if (!owns) return res.status(403).json({ error: "This student is not enrolled in one of your courses." });
        recipientIds = [recipient_id];
      } else if (recipient_type === "course") {
        if (!course_id) return res.status(400).json({ error: "Course is required." });
        if (!(await assertOwnsCourse(sender.id, course_id))) return res.status(403).json({ error: "This is not your course." });
        const [enrolled] = await pool.query("SELECT user_id FROM enrollments WHERE course_id = ?", [course_id]);
        recipientIds = enrolled.map(e => e.user_id);
      } else {
        return res.status(400).json({ error: "Invalid recipient type for a trainer." });
      }
    } else if (sender.role === "admin") {
      if (recipient_type === "trainer") {
        if (!recipient_id) return res.status(400).json({ error: "Trainer is required." });
        const [[trainer]] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'trainer'", [recipient_id]);
        if (!trainer) return res.status(404).json({ error: "Trainer not found." });
        recipientIds = [recipient_id];
      } else if (recipient_type === "all_trainers") {
        const [trainers] = await pool.query("SELECT id FROM users WHERE role = 'trainer'");
        recipientIds = trainers.map(t => t.id);
      } else {
        return res.status(400).json({ error: "Invalid recipient type for an admin." });
      }
    } else {
      return res.status(403).json({ error: "You are not authorized to send messages." });
    }

    if (recipientIds.length === 0) {
      return res.status(400).json({ error: "There is no one to send this message to yet." });
    }

    for (const rid of recipientIds) {
      await pool.query(
        "INSERT INTO direct_messages (sender_id, recipient_id, course_id, subject, body) VALUES (?, ?, ?, ?, ?)",
        [sender.id, rid, course_id || null, subject, body]
      );
    }

    logActivity(sender.id, sender.full_name, "message", sender.full_name + " sent a message: \"" + subject + "\"");

    res.json({ success: true, recipients: recipientIds.length });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ error: "Could not send the message right now." });
  }
});

app.get("/api/messages/inbox", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT dm.id, dm.subject, dm.body, dm.is_read, dm.created_at, u.full_name AS sender_name " +
      "FROM direct_messages dm JOIN users u ON u.id = dm.sender_id " +
      "WHERE dm.recipient_id = ? ORDER BY dm.created_at DESC",
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Inbox error:", err.message);
    res.json([]);
  }
});

app.get("/api/messages/sent", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT dm.id, dm.subject, dm.body, dm.created_at, u.full_name AS recipient_name " +
      "FROM direct_messages dm JOIN users u ON u.id = dm.recipient_id " +
      "WHERE dm.sender_id = ? ORDER BY dm.created_at DESC LIMIT 50",
      [req.session.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Sent messages error:", err.message);
    res.json([]);
  }
});

app.post("/api/messages/:id/read", requireLogin, async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE direct_messages SET is_read = TRUE WHERE id = ? AND recipient_id = ?",
      [req.params.id, req.session.user.id]
    );
    res.json({ success: true, updated: result.affectedRows > 0 });
  } catch (err) {
    console.error("Mark message read error:", err.message);
    res.status(500).json({ error: "Could not update this message right now." });
  }
});
// ---------- Admin: manage user access ----------
app.get("/api/admin/users", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Not authorized." });
    const [rows] = await pool.query(
      "SELECT u.id, u.full_name, u.role, u.phone, u.is_active, " +
      "(SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS student_count, " +
      "(SELECT COUNT(*) FROM courses c WHERE c.trainer_id = u.id) AS trainer_count " +
      "FROM users u WHERE u.role IN ('student', 'trainer') ORDER BY u.role, u.full_name"
    );
    res.json(rows);
  } catch (err) {
    console.error("Admin users list error:", err.message);
    res.status(500).json({ error: "Could not load users right now." });
  }
});

app.get("/api/admin/certificates/:studentId/courses", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const [rows] = await pool.query(
      "SELECT c.id AS course_id, c.title, e.completed " +
      "FROM enrollments e JOIN courses c ON c.id = e.course_id " +
      "WHERE e.user_id = ? ORDER BY c.title",
      [studentId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Certificate courses error:", err.message);
    res.status(500).json({ error: "Could not load courses." });
  }
});

app.post("/api/admin/certificates/toggle-complete", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { user_id, course_id, completed } = req.body;
    if (!user_id || !course_id) return res.status(400).json({ error: "Student and course are required." });
    await pool.query("UPDATE enrollments SET completed = ? WHERE user_id = ? AND course_id = ?", [completed ? 1 : 0, user_id, course_id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Toggle complete error:", err.message);
    res.status(500).json({ error: "Could not update completion status." });
  }
});

app.post("/api/admin/users/:id/status", async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== "admin") return res.status(403).json({ error: "Not authorized." });
    const targetId = Number(req.params.id);
    const { is_active } = req.body;
    if (targetId === req.session.user.id) return res.status(400).json({ error: "You cannot deactivate your own account." });

    const [[target]] = await pool.query("SELECT id, role, full_name FROM users WHERE id = ?", [targetId]);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin") return res.status(400).json({ error: "Admins cannot be deactivated here." });

    await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [is_active ? 1 : 0, targetId]);
    logActivity(req.session.user.id, req.session.user.full_name, is_active ? "user_reactivated" : "user_deactivated",
      req.session.user.full_name + (is_active ? " reactivated " : " deactivated ") + target.full_name + "'s account.");

    res.json({ success: true });
  } catch (err) {
    console.error("Update user status error:", err.message);
    res.status(500).json({ error: "Could not update this account right now." });
  }
});

app.delete("/api/admin/users/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.session.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    const [[target]] = await pool.query("SELECT id, role, full_name FROM users WHERE id = ?", [targetId]);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin") return res.status(400).json({ error: "Admin accounts cannot be deleted here." });

    if (target.role === "student") {
      await pool.query("DELETE FROM attendance WHERE student_id = ?", [targetId]);
      await pool.query("DELETE FROM assessment_scores WHERE student_id = ?", [targetId]);
      await pool.query("DELETE FROM enrollments WHERE user_id = ?", [targetId]);
    } else if (target.role === "trainer") {
      await pool.query("UPDATE courses SET trainer_id = NULL WHERE trainer_id = ?", [targetId]);
    }

    await pool.query("DELETE FROM direct_messages WHERE sender_id = ? OR recipient_id = ?", [targetId, targetId]);
    await pool.query("DELETE FROM password_resets WHERE user_id = ?", [targetId]);
    await pool.query("UPDATE activity_log SET actor_id = NULL WHERE actor_id = ?", [targetId]);

    await pool.query("DELETE FROM users WHERE id = ?", [targetId]);

    logActivity(req.session.user.id, req.session.user.full_name, "user_deleted",
      req.session.user.full_name + " deleted " + target.full_name + "'s (" + target.role + ") account.");

    res.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({ error: "Could not delete this account right now." });
  }
});
// ---------- Admin: add, edit fee, delete courses ----------
app.post("/api/admin/courses/create", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { title, description, level, duration_weeks, fee_kes } = req.body;
    if (!title || !level) return res.status(400).json({ error: "Title and level are required." });
    if (!["Beginner", "Intermediate", "Advanced"].includes(level)) return res.status(400).json({ error: "Invalid level." });

    const [existing] = await pool.query("SELECT id FROM courses WHERE title = ?", [title]);
    if (existing.length > 0) return res.status(409).json({ error: "A course with that title already exists." });

    const feeValue = (fee_kes === "" || fee_kes === null || fee_kes === undefined) ? null : Number(fee_kes);
    const durationValue = duration_weeks ? Number(duration_weeks) : 4;

    await pool.query(
      "INSERT INTO courses (title, description, level, duration_weeks, fee_kes, trainer_id) VALUES (?, ?, ?, ?, ?, NULL)",
      [title, description || "", level, durationValue, feeValue]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Create course error:", err.message);
    res.status(500).json({ error: "Could not create the course right now." });
  }
});

app.post("/api/admin/courses/:id/fee", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const { fee_kes } = req.body;
    const feeValue = (fee_kes === "" || fee_kes === null || fee_kes === undefined) ? null : Number(fee_kes);
    if (feeValue !== null && (isNaN(feeValue) || feeValue < 0)) return res.status(400).json({ error: "Enter a valid fee amount, or leave blank for a free course." });

    const [result] = await pool.query("UPDATE courses SET fee_kes = ? WHERE id = ?", [feeValue, courseId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Course not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Update fee error:", err.message);
    res.status(500).json({ error: "Could not update the fee right now." });
  }
});

app.delete("/api/admin/courses/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const [[course]] = await pool.query("SELECT title FROM courses WHERE id = ?", [courseId]);
    if (!course) return res.status(404).json({ error: "Course not found." });

    const [sessionRows] = await pool.query("SELECT id FROM class_sessions WHERE course_id = ?", [courseId]);
    const sessionIds = sessionRows.map(s => s.id);
    if (sessionIds.length > 0) {
      await pool.query("DELETE FROM attendance WHERE session_id IN (?)", [sessionIds]);
    }

    const [noteRows] = await pool.query("SELECT stored_filename FROM notes WHERE course_id = ?", [courseId]);
    noteRows.forEach(n => {
      const filePath = path.join(uploadsDir, n.stored_filename);
      fs.unlink(filePath, () => {});
    });

    await pool.query("DELETE FROM notes WHERE course_id = ?", [courseId]);
    await pool.query("DELETE FROM class_links WHERE course_id = ?", [courseId]);
    await pool.query("DELETE FROM class_sessions WHERE course_id = ?", [courseId]);
    await pool.query("DELETE FROM assessment_scores WHERE course_id = ?", [courseId]);
    await pool.query("DELETE FROM enrollments WHERE course_id = ?", [courseId]);
    await pool.query("UPDATE direct_messages SET course_id = NULL WHERE course_id = ?", [courseId]);
    await pool.query("DELETE FROM courses WHERE id = ?", [courseId]);

    logActivity(req.session.user.id, req.session.user.full_name, "course_deleted", req.session.user.full_name + " deleted the course \"" + course.title + "\".");
    res.json({ success: true });
  } catch (err) {
    console.error("Delete course error:", err.message);
    res.status(500).json({ error: "Could not delete the course right now." });
  }
});
// ---------- Projects: public showcase + admin management ----------
app.get("/api/projects", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, title, summary, status, client_name, tags, image_filename, completed_on, created_at FROM projects ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.warn("Projects: database not reachable.", err.message);
    res.json([]);
  }
});

app.post("/api/admin/projects/create", requireLogin, requireRole("admin"), projectUpload.single("image"), async (req, res) => {
  try {
    const { title, client_name, summary, tags, status, completed_on } = req.body;
    if (!title) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Project title is required." });
    }
    const validStatus = ["planning", "in_progress", "testing", "completed"].includes(status) ? status : "planning";
    const imageFilename = req.file ? req.file.filename : null;
    const completedOnValue = completed_on ? completed_on : null;

    await pool.query(
      "INSERT INTO projects (title, summary, status, client_name, tags, image_filename, completed_on) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [title, summary || null, validStatus, client_name || null, tags || null, imageFilename, completedOnValue]
    );

    logActivity(req.session.user.id, req.session.user.full_name, "project_posted", req.session.user.full_name + " posted a new project: \"" + title + "\".");
    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("Create project error:", err.message);
    res.status(500).json({ error: "Could not save the project right now." });
  }
});

app.post("/api/admin/projects/:id/edit", requireLogin, requireRole("admin"), projectUpload.single("image"), async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const { title, client_name, summary, tags, status, completed_on, remove_image } = req.body;

    const [[existing]] = await pool.query("SELECT image_filename FROM projects WHERE id = ?", [projectId]);
    if (!existing) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Project not found." });
    }
    if (!title) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Project title is required." });
    }

    const validStatus = ["planning", "in_progress", "testing", "completed"].includes(status) ? status : "planning";
    const completedOnValue = completed_on ? completed_on : null;

    let imageFilename = existing.image_filename;
    if (req.file) {
      if (existing.image_filename) fs.unlink(path.join(projectImagesDir, existing.image_filename), () => {});
      imageFilename = req.file.filename;
    } else if (remove_image === "true") {
      if (existing.image_filename) fs.unlink(path.join(projectImagesDir, existing.image_filename), () => {});
      imageFilename = null;
    }

    await pool.query(
      "UPDATE projects SET title = ?, summary = ?, status = ?, client_name = ?, tags = ?, image_filename = ?, completed_on = ? WHERE id = ?",
      [title, summary || null, validStatus, client_name || null, tags || null, imageFilename, completedOnValue, projectId]
    );

    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("Edit project error:", err.message);
    res.status(500).json({ error: "Could not update the project right now." });
  }
});

app.delete("/api/admin/projects/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const [[project]] = await pool.query("SELECT image_filename FROM projects WHERE id = ?", [projectId]);
    if (!project) return res.status(404).json({ error: "Project not found." });

    if (project.image_filename) {
      fs.unlink(path.join(projectImagesDir, project.image_filename), () => {});
    }
    await pool.query("DELETE FROM projects WHERE id = ?", [projectId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err.message);
    res.status(500).json({ error: "Could not delete the project right now." });
  }
});
// ---------- Team: public listing + admin management ----------
app.get("/api/team", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, full_name, role_title, image_filename FROM team_members ORDER BY sort_order, id");
    res.json(rows);
  } catch (err) {
    console.warn("Team: database not reachable.", err.message);
    res.json([]);
  }
});

app.post("/api/admin/team/create", requireLogin, requireRole("admin"), teamUpload.single("image"), async (req, res) => {
  try {
    const { full_name, role_title } = req.body;
    if (!full_name) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Name is required." });
    }
    const imageFilename = req.file ? req.file.filename : null;

    await pool.query(
      "INSERT INTO team_members (full_name, role_title, image_filename) VALUES (?, ?, ?)",
      [full_name, role_title || null, imageFilename]
    );

    logActivity(req.session.user.id, req.session.user.full_name, "team_member_added", req.session.user.full_name + " added " + full_name + " to the team page.");
    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("Add team member error:", err.message);
    res.status(500).json({ error: "Could not add this team member right now." });
  }
});

app.post("/api/admin/team/:id/edit", requireLogin, requireRole("admin"), teamUpload.single("image"), async (req, res) => {
  try {
    const memberId = Number(req.params.id);
    const { full_name, role_title, remove_image } = req.body;

    const [[existing]] = await pool.query("SELECT image_filename FROM team_members WHERE id = ?", [memberId]);
    if (!existing) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Team member not found." });
    }
    if (!full_name) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Name is required." });
    }

    let imageFilename = existing.image_filename;
    if (req.file) {
      if (existing.image_filename) fs.unlink(path.join(teamImagesDir, existing.image_filename), () => {});
      imageFilename = req.file.filename;
    } else if (remove_image === "true") {
      if (existing.image_filename) fs.unlink(path.join(teamImagesDir, existing.image_filename), () => {});
      imageFilename = null;
    }

    await pool.query(
      "UPDATE team_members SET full_name = ?, role_title = ?, image_filename = ? WHERE id = ?",
      [full_name, role_title || null, imageFilename, memberId]
    );

    res.json({ success: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("Edit team member error:", err.message);
    res.status(500).json({ error: "Could not update this team member right now." });
  }
});

app.delete("/api/admin/team/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const memberId = Number(req.params.id);
    const [[member]] = await pool.query("SELECT image_filename FROM team_members WHERE id = ?", [memberId]);
    if (!member) return res.status(404).json({ error: "Team member not found." });

    if (member.image_filename) {
      fs.unlink(path.join(teamImagesDir, member.image_filename), () => {});
    }
    await pool.query("DELETE FROM team_members WHERE id = ?", [memberId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete team member error:", err.message);
    res.status(500).json({ error: "Could not remove this team member right now." });
  }
});

// ---------- Contact: public form + admin inbox ----------
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email and message are all required." });
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    await pool.query(
      "INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)",
      [name, email, subject || null, message]
    );

    mailTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: ADMIN_EMAIL,
      replyTo: email,
      subject: "New contact form message: " + (subject || "No subject"),
      text: "From: " + name + " (" + email + ")\n\n" + message
    }).catch(err => console.warn("Could not send contact notification email:", err.message));

    mailTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "We received your message - Spark Technologies",
      text: "Hi " + name + ",\n\n" +
        "Thank you for reaching out to Spark Technologies. We have received your message and will get back to you shortly, usually within 1-2 business days.\n\n" +
        "For your records, here is what you sent us:\n" +
        "Subject: " + (subject || "No subject") + "\n" +
        message + "\n\n" +
        "- Spark Technologies\n" +
        "Meru, Kenya"
    }).catch(err => console.warn("Could not send contact auto-reply email:", err.message));

    res.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err.message);
    res.status(500).json({ error: "Could not send your message right now. Please make sure MySQL is running." });
  }
});

app.get("/api/admin/messages", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, subject, message, is_read, created_at FROM contact_messages ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Admin messages list error:", err.message);
    res.json([]);
  }
});

app.post("/api/admin/messages/:id/read", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { is_read } = req.body;
    const [result] = await pool.query(
      "UPDATE contact_messages SET is_read = ? WHERE id = ?",
      [is_read ? 1 : 0, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Message not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Mark contact message read error:", err.message);
    res.status(500).json({ error: "Could not update this message right now." });
  }
});

app.post("/api/admin/messages/:id/reply", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { reply_body } = req.body;
    if (!reply_body || !reply_body.trim()) {
      return res.status(400).json({ error: "Reply message is required." });
    }

    const [[msg]] = await pool.query(
      "SELECT name, email, subject FROM contact_messages WHERE id = ?",
      [req.params.id]
    );
    if (!msg) return res.status(404).json({ error: "Message not found." });

    const replySubject = "Re: " + (msg.subject || "Your message to Spark Technologies");

    await mailTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: msg.email,
      subject: replySubject,
      text: "Hi " + msg.name + ",\n\n" + reply_body + "\n\n- Spark Technologies"
    });

    await pool.query("UPDATE contact_messages SET is_read = TRUE WHERE id = ?", [req.params.id]);

    logActivity(req.session.user.id, req.session.user.full_name, "contact_replied", req.session.user.full_name + " replied to " + msg.name + "'s message.");
    res.json({ success: true });
  } catch (err) {
    console.error("Reply to contact message error:", err.message);
    res.status(500).json({ error: "Could not send the reply right now. Check your Gmail App Password in .env." });
  }
});

app.delete("/api/admin/messages/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM contact_messages WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Message not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete contact message error:", err.message);
    res.status(500).json({ error: "Could not delete this message right now." });
  }
});

// ---------- Password reset ----------
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const [[user]] = await pool.query("SELECT id, full_name FROM users WHERE email = ?", [email]);

    // Always respond success, whether or not the account exists — avoids revealing which emails are registered.
    if (!user) {
      return res.json({ success: true });
    }

    const code = crypto.randomInt(100000, 1000000).toString(); // 6-digit numeric code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      "INSERT INTO password_resets (user_id, code, expires_at) VALUES (?, ?, ?)",
      [user.id, code, expiresAt]
    );

    mailTransporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your Spark Technologies password reset code",
      text: "Hi " + user.full_name + ",\n\n" +
        "Use the code below to reset your password. It expires in 10 minutes and can only be used once.\n\n" +
        "Your code: " + code + "\n\n" +
        "If you did not request this, you can safely ignore this email.\n\n" +
        "- Spark Technologies"
    }).catch(err => console.warn("Could not send password reset email:", err.message));

    res.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Could not process this request right now. Please make sure MySQL is running." });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: "Email, code, and new password are required." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const [[user]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (!user) return res.status(400).json({ error: "Invalid code or email." });

    const [[reset]] = await pool.query(
      "SELECT id, expires_at, used FROM password_resets WHERE user_id = ? AND code = ? ORDER BY id DESC LIMIT 1",
      [user.id, code]
    );

    if (!reset) return res.status(400).json({ error: "Invalid code or email." });
    if (reset.used) return res.status(400).json({ error: "This code has already been used. Please request a new one." });
    if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: "This code has expired. Please request a new one." });

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, user.id]);
    await pool.query("UPDATE password_resets SET used = TRUE WHERE id = ?", [reset.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Could not reset your password right now. Please make sure MySQL is running." });
  }
});

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "..", "frontend", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({ message: "Spark Technologies API is running." });
  }
});

app.listen(PORT, () => {
  console.log("Spark Technologies server running at http://localhost:" + PORT);
  ensureAdminAccount();
  ensureTeamTable();
  ensureContactTable();
  ensurePasswordResetTable();
});




























