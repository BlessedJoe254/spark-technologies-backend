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

const projectStorage = multer.memoryStorage();
const projectUpload = multer({ storage: projectStorage, limits: { fileSize: 8 * 1024 * 1024 } });

const teamImagesDir = path.join(__dirname, "team-images");
if (!fs.existsSync(teamImagesDir)) fs.mkdirSync(teamImagesDir);
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

const teamStorage = multer.memoryStorage();
const teamUpload = multer({ storage: teamStorage, limits: { fileSize: 8 * 1024 * 1024 } });

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "spark-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, secure: "auto", sameSite: "lax" }
}));
const frontendPath = path.join(__dirname, "frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}
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

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "onboarding@resend.dev";
const TEST_RECIPIENT = "joemutugi291@gmail.com"; // Resend test domain can only send here until a real domain is verified

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
      "SELECT id, title, description, level, duration_weeks, duration_value, duration_unit, fee_kes FROM courses " +
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
      "SELECT c.id, c.title, c.level, c.duration_weeks, c.duration_value, c.duration_unit, c.fee_kes, e.has_paid, e.payment_code " +
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
        "SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at",
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
        duration_weeks: r.duration_weeks, duration_value: r.duration_value, duration_unit: r.duration_unit,
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
app.get("/api/trainer/students", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const trainerId = req.session.user.id;
    const hsAdminCourse = req.session.user.role === "admin" ? await hsCourse() : null;
    const hsAdminCourseId = hsAdminCourse ? hsAdminCourse.id : 0;
    const [rows] = await pool.query(
      "SELECT c.id AS course_id, c.title AS course_title, u.id AS student_id, u.full_name, u.phone, e.has_paid, e.completed, " +
      "e.intake_id, i.name AS intake_name, i.start_date AS intake_start " +
      "FROM courses c " +
      "LEFT JOIN enrollments e ON e.course_id = c.id " +
      "LEFT JOIN intakes i ON i.id = e.intake_id " +
      "LEFT JOIN users u ON u.id = e.user_id " +
      "WHERE (c.trainer_id = ? OR c.id = ?) ORDER BY c.title, i.start_date DESC, u.full_name",
      [trainerId, hsAdminCourseId]
    );

    const groups = {};
    rows.forEach(r => {
      if (!groups[r.course_id]) {
        groups[r.course_id] = { course_id: r.course_id, course_title: r.course_title, students: [], notes: [], class_links: [], sessions_count: 0 };
      }
      if (r.student_id) {
        groups[r.course_id].students.push({ id: r.student_id, full_name: r.full_name, phone: r.phone, has_paid: !!r.has_paid, completed: !!r.completed, intake_id: r.intake_id || null, intake_name: r.intake_name || null, intake_start: r.intake_start || null, attended: 0, scores: { cat1: null, cat2: null, final: null } });
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
        "SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at",
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

async function assertOwnsCourse(userId, courseId) {
  const [[usr]] = await pool.query("SELECT role FROM users WHERE id = ?", [userId]);
  if (usr && usr.role === "admin") {
    const [[crs]] = await pool.query("SELECT id FROM courses WHERE id = ?", [courseId]);
    return !!crs;
  }
  return assertOwnsCourseBase(userId, courseId);
}

async function assertOwnsCourseBase(trainerId, courseId) {
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

// ---------- Completion support: make sure enrollments.completed exists ----------
async function ensureCompletedSchema() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'completed'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE enrollments ADD COLUMN completed TINYINT(1) NOT NULL DEFAULT 0");
    }
  } catch (err) {
    console.warn("completed schema setup failed:", err.message);
  }
}
ensureCompletedSchema();
app.post("/api/trainer/complete-student", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const { course_id, student_id, completed } = req.body;
    if (!course_id || !student_id) return res.status(400).json({ error: "Course and student are required." });
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) return res.status(403).json({ error: "This is not your course." });

    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM class_sessions WHERE course_id = ?", [course_id]);
    if (completed && cnt < 1) return res.status(400).json({ error: "Record at least one class before marking a student completed." });

    const [result] = await pool.query("UPDATE enrollments SET completed = ? WHERE user_id = ? AND course_id = ?", [completed ? 1 : 0, student_id, course_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "This student is not enrolled in the course." });
    res.json({ success: true });
  } catch (err) {
    console.error("Trainer complete student error:", err.message);
    res.status(500).json({ error: "Could not update completion right now." });
  }
});

app.post("/api/trainer/sessions", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
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

app.post("/api/trainer/attendance", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
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

app.post("/api/trainer/scores", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
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

app.post("/api/trainer/notes", requireLogin, requireAnyRole(["trainer", "admin"]), upload.single("file"), async (req, res) => {
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
      const [linkRows] = await pool.query("SELECT id, course_id, title, url FROM class_links WHERE course_id IN (?) AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at", [courseIdList]);
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
    // busiest trainers first (most students across all their courses)
    const studentTotal = x => x.courses.reduce((sum, c) => sum + c.students.length, 0);
    result.sort((a, b) => studentTotal(b) - studentTotal(a) || String(a.full_name).localeCompare(String(b.full_name)));
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
    await pool.query("UPDATE enrollments SET has_paid = TRUE, paid_at = COALESCE(paid_at, NOW()) WHERE id = ?", [enrollment_id]);
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
      "SELECT id, title, description, level, duration_weeks, duration_value, duration_unit, fee_kes, trainer_id FROM courses " +
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

// ---------- Monthly earnings support ----------
async function ensurePaidAtSchema() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'paid_at'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE enrollments ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL");
      await pool.query("UPDATE enrollments SET paid_at = enrolled_at WHERE has_paid = TRUE AND paid_at IS NULL");
    }
  } catch (err) {
    console.warn("paid_at schema setup failed:", err.message);
  }
}
ensurePaidAtSchema();

// month = "YYYY-MM", "all", or missing (current month, UTC)
function monthRange(m) {
  if (m === "all") return { all: true };
  let y, mo;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m || "");
  if (match) { y = Number(match[1]); mo = Number(match[2]); }
  else { const now = new Date(); y = now.getUTCFullYear(); mo = now.getUTCMonth() + 1; }
  const pad = n => String(n).padStart(2, "0");
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { all: false, start: y + "-" + pad(mo) + "-01 00:00:00", end: ny + "-" + pad(nm) + "-01 00:00:00" };
}

app.get("/api/trainer/earnings", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const trainerId = req.session.user.id;
    const range = monthRange(req.query.month);
    const monthSql = range.all ? "" : "AND e.paid_at >= ? AND e.paid_at < ? ";
    const params = range.all ? [trainerId] : [trainerId, range.start, range.end];
    const [rows] = await pool.query(
      "SELECT c.id AS course_id, c.title AS course_title, c.fee_kes, COUNT(e.id) AS paid_count " +
      "FROM courses c JOIN enrollments e ON e.course_id = c.id " +
      "WHERE c.trainer_id = ? AND e.has_paid = TRUE AND c.fee_kes IS NOT NULL " + monthSql +
      "GROUP BY c.id, c.title, c.fee_kes",
      params
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
    const range = monthRange(req.query.month);
    const monthSql = range.all ? "" : "AND e.paid_at >= ? AND e.paid_at < ? ";
    const params = range.all ? [] : [range.start, range.end];
    const [rows] = await pool.query(
      "SELECT t.id AS trainer_id, t.full_name AS trainer_name, c.id AS course_id, c.fee_kes, COUNT(e.id) AS paid_count " +
      "FROM users t " +
      "JOIN courses c ON c.trainer_id = t.id " +
      "JOIN enrollments e ON e.course_id = c.id AND e.has_paid = TRUE " +
      "WHERE t.role = 'trainer' AND c.fee_kes IS NOT NULL " + monthSql +
      "GROUP BY t.id, t.full_name, c.id, c.fee_kes",
      params
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
      "SELECT action_type, REPLACE(description, 'Blessed Joe', 'Admin') AS description, created_at FROM activity_log WHERE action_type NOT IN ('user_deleted','user_deactivated','user_reactivated','message','contact_replied') ORDER BY created_at DESC LIMIT 10"
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
app.get("/api/admin/users", requireLogin, requireRole("admin"), async (req, res) => {
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

// ---------- Students overview: joined date + admin list ----------
async function ensureUserCreatedAtSchema() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_at'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN created_at TIMESTAMP NULL DEFAULT NULL");
      await pool.query("UPDATE users u SET u.created_at = (SELECT MIN(e.enrolled_at) FROM enrollments e WHERE e.user_id = u.id) WHERE u.created_at IS NULL");
      await pool.query("ALTER TABLE users MODIFY created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
    }
  } catch (err) {
    console.warn("users.created_at schema setup failed:", err.message);
  }
}
ensureUserCreatedAtSchema();

app.get("/api/admin/students-overview", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [students] = await pool.query(
      "SELECT id, full_name, email, phone, is_active, created_at FROM users WHERE role = 'student' ORDER BY full_name"
    );
    const [enr] = await pool.query(
      "SELECT e.user_id, e.course_id, c.title, c.fee_kes, e.has_paid, e.paid_at, e.completed, e.enrolled_at, i.name AS intake_name " +
      "FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN intakes i ON i.id = e.intake_id " +
      "ORDER BY e.enrolled_at"
    );
    const byUser = {};
    enr.forEach(e => {
      if (!byUser[e.user_id]) byUser[e.user_id] = [];
      byUser[e.user_id].push({
        course_id: e.course_id,
        title: e.title,
        free: e.fee_kes === null,
        paid: !!e.has_paid,
        paid_at: e.paid_at || null,
        completed: !!e.completed,
        enrolled_at: e.enrolled_at || null,
        intake_name: e.intake_name || null
      });
    });
    res.json(students.map(s => ({
      id: s.id,
      full_name: s.full_name,
      email: s.email,
      phone: s.phone,
      account_active: !(s.is_active === 0 || s.is_active === false),
      joined_at: s.created_at || null,
      courses: byUser[s.id] || []
    })));
  } catch (err) {
    console.error("Students overview error:", err.message);
    res.status(500).json({ error: "Could not load students right now." });
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

app.post("/api/admin/users/:id/status", requireLogin, requireRole("admin"), async (req, res) => {
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
// ---------- Course duration (weeks or months) and editing ----------
async function ensureCourseDurationSchema() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'duration_unit'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE courses ADD COLUMN duration_unit VARCHAR(10) NOT NULL DEFAULT 'weeks', ADD COLUMN duration_value INT NULL");
      await pool.query(
        "UPDATE courses SET duration_unit = IF(duration_weeks % 4 = 0, 'months', 'weeks'), " +
        "duration_value = IF(duration_weeks % 4 = 0, duration_weeks / 4, duration_weeks)"
      );
    }
  } catch (err) {
    console.warn("courses duration schema setup failed:", err.message);
  }
}
ensureCourseDurationSchema();

function parseDuration(value, unit) {
  const n = Math.floor(Number(value));
  if (!isFinite(n) || n < 1 || n > 520) return null;
  const u = unit === "months" ? "months" : "weeks";
  return { value: n, unit: u, weeks: u === "months" ? n * 4 : n };
}

app.post("/api/admin/courses/:id/edit", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const { title, description, level, duration_value, duration_unit, fee_kes } = req.body;
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle || !level) return res.status(400).json({ error: "Title and level are required." });
    if (!["Beginner", "Intermediate", "Advanced"].includes(level)) return res.status(400).json({ error: "Invalid level." });
    const dur = parseDuration(duration_value, duration_unit);
    if (!dur) return res.status(400).json({ error: "Enter a valid duration (a whole number, 1 or more)." });
    const feeValue = (fee_kes === "" || fee_kes === null || fee_kes === undefined) ? null : Number(fee_kes);
    if (feeValue !== null && (isNaN(feeValue) || feeValue < 0)) return res.status(400).json({ error: "Enter a valid fee amount, or leave blank for a free course." });

    const [[course]] = await pool.query("SELECT id FROM courses WHERE id = ?", [courseId]);
    if (!course) return res.status(404).json({ error: "Course not found." });
    const [dupe] = await pool.query("SELECT id FROM courses WHERE title = ? AND id <> ?", [cleanTitle, courseId]);
    if (dupe.length > 0) return res.status(409).json({ error: "Another course already has that title." });

    await pool.query(
      "UPDATE courses SET title = ?, description = ?, level = ?, duration_weeks = ?, duration_value = ?, duration_unit = ?, fee_kes = ? WHERE id = ?",
      [cleanTitle, description || "", level, dur.weeks, dur.value, dur.unit, feeValue, courseId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Edit course error:", err.message);
    res.status(500).json({ error: "Could not save the course right now." });
  }
});

// ---------- Testimonials (what people say about us) ----------
async function ensureTestimonialsTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS testimonials (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "name VARCHAR(80) NOT NULL, " +
      "role VARCHAR(20) NOT NULL, " +
      "course VARCHAR(120) NULL, " +
      "rating TINYINT NOT NULL, " +
      "message VARCHAR(400) NOT NULL, " +
      "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
      ") CHARACTER SET utf8mb4"
    );
  } catch (err) {
    console.warn("testimonials table setup failed:", err.message);
  }
}
ensureTestimonialsTable();

const testimonialHits = new Map();

app.get("/api/testimonials", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, role, course, rating, message, created_at FROM testimonials ORDER BY id DESC LIMIT 60"
    );
    res.json(rows);
  } catch (err) {
    console.error("Testimonials load error:", err.message);
    res.json([]);
  }
});

app.post("/api/testimonials", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.website) return res.json({ success: true }); // bot trap: pretend it worked

    const now = Date.now();
    const key = req.ip || "unknown";
    const recent = (testimonialHits.get(key) || []).filter(t => now - t < 3600000);
    if (recent.length >= 3) return res.status(429).json({ error: "You have sent a few messages already. Please try again in an hour." });

    const name = String(body.name || "").trim().slice(0, 80);
    const roleRaw = String(body.role || "").trim().replace(/\s+/g, " ").slice(0, 20); const role = roleRaw.length >= 2 ? roleRaw : "Visitor";
    const course = String(body.course || "").trim().slice(0, 120);
    const rating = Math.floor(Number(body.rating));
    const message = String(body.message || "").trim();

    if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "Please choose a star rating." });
    if (message.length < 10) return res.status(400).json({ error: "Please write at least 10 characters." });
    if (message.length > 400) return res.status(400).json({ error: "Please keep your message under 400 characters." });

    const [r] = await pool.query(
      "INSERT INTO testimonials (name, role, course, rating, message) VALUES (?, ?, ?, ?, ?)",
      [name, role, course || null, rating, message]
    );
    recent.push(now);
    testimonialHits.set(key, recent);
    logActivity(null, name, "testimonial", name + " shared a review about Spark Technologies."); res.json({ success: true, id: r.insertId });
  } catch (err) {
    console.error("Testimonial save error:", err.message);
    res.status(500).json({ error: "Could not send your message right now." });
  }
});

app.get("/api/testimonials/can-moderate", requireLogin, requireRole("admin"), (req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin/testimonials/:id/delete", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM testimonials WHERE id = ?", [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error("Testimonial delete error:", err.message);
    res.status(500).json({ error: "Could not delete that message." });
  }
});

app.post("/api/admin/courses/create", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { title, description, level, duration_weeks, duration_value, duration_unit, fee_kes } = req.body;
    if (!title || !level) return res.status(400).json({ error: "Title and level are required." });
    if (!["Beginner", "Intermediate", "Advanced"].includes(level)) return res.status(400).json({ error: "Invalid level." });

    const [existing] = await pool.query("SELECT id FROM courses WHERE title = ?", [title]);
    if (existing.length > 0) return res.status(409).json({ error: "A course with that title already exists." });

    const feeValue = (fee_kes === "" || fee_kes === null || fee_kes === undefined) ? null : Number(fee_kes);
    const durRaw = (duration_value !== undefined && duration_value !== "" && duration_value !== null) ? duration_value : duration_weeks;
    const dur = parseDuration(durRaw ? durRaw : 4, duration_unit);
    if (!dur) return res.status(400).json({ error: "Enter a valid duration (a whole number, 1 or more)." });

    await pool.query(
      "INSERT INTO courses (title, description, level, duration_weeks, duration_value, duration_unit, fee_kes, trainer_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      [title, description || "", level, dur.weeks, dur.value, dur.unit, feeValue]
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
      return res.status(400).json({ error: "Project title is required." });
    }
    const validStatus = ["planning", "in_progress", "testing", "completed"].includes(status) ? status : "planning";
    let imageFilename = null;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "project-images");
      imageFilename = result.secure_url;
    }
    const completedOnValue = completed_on ? completed_on : null;

    await pool.query(
      "INSERT INTO projects (title, summary, status, client_name, tags, image_filename, completed_on) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [title, summary || null, validStatus, client_name || null, tags || null, imageFilename, completedOnValue]
    );

    logActivity(req.session.user.id, req.session.user.full_name, "project_posted", req.session.user.full_name + " posted a new project: \"" + title + "\".");
    res.json({ success: true });
  } catch (err) {
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
      return res.status(404).json({ error: "Project not found." });
    }
    if (!title) {
      return res.status(400).json({ error: "Project title is required." });
    }

    const validStatus = ["planning", "in_progress", "testing", "completed"].includes(status) ? status : "planning";
    const completedOnValue = completed_on ? completed_on : null;

    let imageFilename = existing.image_filename;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "project-images");
      imageFilename = result.secure_url;
    } else if (remove_image === "true") {
      imageFilename = null;
    }

    await pool.query(
      "UPDATE projects SET title = ?, summary = ?, status = ?, client_name = ?, tags = ?, image_filename = ?, completed_on = ? WHERE id = ?",
      [title, summary || null, validStatus, client_name || null, tags || null, imageFilename, completedOnValue, projectId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Edit project error:", err.message);
    res.status(500).json({ error: "Could not update the project right now." });
  }
});

app.delete("/api/admin/projects/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const [[project]] = await pool.query("SELECT image_filename FROM projects WHERE id = ?", [projectId]);
    if (!project) return res.status(404).json({ error: "Project not found." });

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
      return res.status(400).json({ error: "Name is required." });
    }
    let imageUrl = null;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "team-images");
      imageUrl = result.secure_url;
    }

    await pool.query(
      "INSERT INTO team_members (full_name, role_title, image_filename) VALUES (?, ?, ?)",
      [full_name, role_title || null, imageUrl]
    );

    logActivity(req.session.user.id, req.session.user.full_name, "team_member_added", req.session.user.full_name + " added " + full_name + " to the team page.");
    res.json({ success: true });
  } catch (err) {
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
      return res.status(404).json({ error: "Team member not found." });
    }
    if (!full_name) {
      return res.status(400).json({ error: "Name is required." });
    }

    let imageUrl = existing.image_filename;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "team-images");
      imageUrl = result.secure_url;
    } else if (remove_image === "true") {
      imageUrl = null;
    }

    await pool.query(
      "UPDATE team_members SET full_name = ?, role_title = ?, image_filename = ? WHERE id = ?",
      [full_name, role_title || null, imageUrl, memberId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Edit team member error:", err.message);
    res.status(500).json({ error: "Could not update this team member right now." });
  }
});

app.delete("/api/admin/team/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const memberId = Number(req.params.id);
    const [[member]] = await pool.query("SELECT image_filename FROM team_members WHERE id = ?", [memberId]);
    if (!member) return res.status(404).json({ error: "Team member not found." });

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

    resend.emails.send({
      from: FROM_EMAIL,
      to: TEST_RECIPIENT,
      reply_to: email,
      subject: "New contact form message: " + (subject || "No subject"),
      text: "From: " + name + " (" + email + ")\n\n" + message
    }).catch(err => console.warn("Could not send contact notification email:", err.message));

    resend.emails.send({
      from: FROM_EMAIL,
      to: TEST_RECIPIENT,
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

    await resend.emails.send({
      from: FROM_EMAIL,
      to: TEST_RECIPIENT,
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

    // Always respond success, whether or not the account exists � avoids revealing which emails are registered.
    if (!user) {
      return res.json({ success: true });
    }

    const code = crypto.randomInt(100000, 1000000).toString(); // 6-digit numeric code
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      "INSERT INTO password_resets (user_id, code, expires_at) VALUES (?, ?, ?)",
      [user.id, code, expiresAt]
    );

    resend.emails.send({
      from: FROM_EMAIL,
      to: TEST_RECIPIENT,
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



// ---------- CAT submissions (student upload / trainer grade / admin view) ----------
const catStorage = multer.memoryStorage();
const catUpload = multer({
  storage: catStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed."));
  }
});

app.post("/api/student/cats/upload", requireLogin, requireRole("student"), catUpload.single("pdf"), async (req, res) => {
  try {
    const { course_id, assessment_type } = req.body;
    const studentId = req.session.user.id;

    if (!course_id || !["cat1", "cat2", "final"].includes(assessment_type)) {
      return res.status(400).json({ error: "A valid course and assessment type are required." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Please attach a PDF file." });
    }

    const [[enrolled]] = await pool.query(
      "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?",
      [studentId, course_id]
    );
    if (!enrolled) {
      return res.status(403).json({ error: "You are not enrolled in this course." });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, "cat-submissions");

    await pool.query(
      "INSERT INTO cat_submissions (course_id, student_id, assessment_type, pdf_url, original_filename) VALUES (?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE pdf_url = VALUES(pdf_url), original_filename = VALUES(original_filename), submitted_at = CURRENT_TIMESTAMP",
      [course_id, studentId, assessment_type, result.secure_url, req.file.originalname]
    );

    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error("CAT upload error:", err.message);
    res.status(500).json({ error: "Could not upload the file right now." });
  }
});

app.get("/api/student/cats", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const [subRows] = await pool.query(
      "SELECT course_id, assessment_type, pdf_url, original_filename, submitted_at FROM cat_submissions WHERE student_id = ?",
      [studentId]
    );
    const [scoreRows] = await pool.query(
      "SELECT course_id, assessment_type, score, max_score FROM assessment_scores WHERE student_id = ?",
      [studentId]
    );
    res.json({ submissions: subRows, scores: scoreRows });
  } catch (err) {
    console.error("Student CAT fetch error:", err.message);
    res.status(500).json({ error: "Could not load your CAT submissions right now." });
  }
});

app.get("/api/trainer/cats", requireLogin, requireRole("trainer"), async (req, res) => {
  try {
    const course_id = Number(req.query.course_id);
    if (!course_id) return res.status(400).json({ error: "course_id is required." });
    if (!(await assertOwnsCourse(req.session.user.id, course_id))) {
      return res.status(403).json({ error: "This is not your course." });
    }

    const [rows] = await pool.query(
      "SELECT cs.student_id, u.full_name AS student_name, cs.assessment_type, cs.pdf_url, cs.original_filename, cs.submitted_at, " +
      "ascore.score, ascore.max_score " +
      "FROM cat_submissions cs " +
      "JOIN users u ON u.id = cs.student_id " +
      "LEFT JOIN assessment_scores ascore ON ascore.course_id = cs.course_id AND ascore.student_id = cs.student_id AND ascore.assessment_type = cs.assessment_type " +
      "WHERE cs.course_id = ? ORDER BY u.full_name, cs.assessment_type",
      [course_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Trainer CAT fetch error:", err.message);
    res.status(500).json({ error: "Could not load CAT submissions right now." });
  }
});

app.get("/api/admin/cats", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT cs.course_id, c.title AS course_title, cs.student_id, u.full_name AS student_name, " +
      "t.full_name AS trainer_name, cs.assessment_type, cs.pdf_url, cs.original_filename, cs.submitted_at, " +
      "ascore.score, ascore.max_score " +
      "FROM cat_submissions cs " +
      "JOIN users u ON u.id = cs.student_id " +
      "JOIN courses c ON c.id = cs.course_id " +
      "LEFT JOIN users t ON t.id = c.trainer_id " +
      "LEFT JOIN assessment_scores ascore ON ascore.course_id = cs.course_id AND ascore.student_id = cs.student_id AND ascore.assessment_type = cs.assessment_type " +
      "ORDER BY c.title, u.full_name, cs.assessment_type"
    );
    res.json(rows);
  } catch (err) {
    console.error("Admin CAT fetch error:", err.message);
    res.status(500).json({ error: "Could not load CAT submissions right now." });
  }
});

// ---------- Intakes ----------
async function ensureIntakeSchema() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS intakes (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "name VARCHAR(100) NOT NULL, " +
      "start_date DATE NOT NULL, " +
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    );
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'intake_id'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE enrollments ADD COLUMN intake_id INT NULL");
    }
  } catch (err) {
    console.warn("Intake schema setup failed:", err.message);
  }
}
ensureIntakeSchema();

app.get("/api/admin/intakes", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT i.id, i.name, i.start_date, COUNT(e.id) AS student_count " +
      "FROM intakes i LEFT JOIN enrollments e ON e.intake_id = i.id " +
      "GROUP BY i.id, i.name, i.start_date ORDER BY i.start_date DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("List intakes error:", err.message);
    res.json([]);
  }
});

app.post("/api/admin/intakes/create", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const startDate = req.body.start_date;
    if (!name || !startDate) return res.status(400).json({ error: "Name and start date are required." });
    await pool.query("INSERT INTO intakes (name, start_date) VALUES (?, ?)", [name, startDate]);
    res.json({ success: true });
  } catch (err) {
    console.error("Create intake error:", err.message);
    res.status(500).json({ error: "Could not create the intake right now." });
  }
});

app.delete("/api/admin/intakes/:id", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [[used]] = await pool.query("SELECT COUNT(*) AS n FROM enrollments WHERE intake_id = ?", [req.params.id]);
    if (used.n > 0) {
      return res.status(409).json({ error: "This intake still has students. Move them to another intake first." });
    }
    await pool.query("DELETE FROM intakes WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete intake error:", err.message);
    res.status(500).json({ error: "Could not delete the intake right now." });
  }
});

// All enrollments with their intake, for the admin assignment screen
app.get("/api/admin/intakes/enrollments", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT e.id AS enrollment_id, u.full_name, u.phone, c.id AS course_id, c.title AS course_title, " +
      "e.intake_id, i.name AS intake_name, e.enrolled_at " +
      "FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id " +
      "LEFT JOIN intakes i ON i.id = e.intake_id ORDER BY c.title, e.enrolled_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Intake enrollments error:", err.message);
    res.json([]);
  }
});

// Assign (or clear) an intake for one or many enrollments
app.post("/api/admin/intakes/assign", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.enrollment_ids) ? req.body.enrollment_ids.map(Number).filter(Boolean) : [];
    const intakeId = req.body.intake_id ? Number(req.body.intake_id) : null;
    if (ids.length === 0) return res.status(400).json({ error: "Select at least one student." });
    if (intakeId) {
      const [[exists]] = await pool.query("SELECT id FROM intakes WHERE id = ?", [intakeId]);
      if (!exists) return res.status(404).json({ error: "Intake not found." });
    }
    await pool.query("UPDATE enrollments SET intake_id = ? WHERE id IN (?)", [intakeId, ids]);
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error("Assign intake error:", err.message);
    res.status(500).json({ error: "Could not assign the intake right now." });
  }
});

// ---------- Live classes (JaaS / Jitsi) ----------
async function ensureLiveClassesTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS live_classes (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, " +
      "course_id INT NOT NULL, " +
      "trainer_id INT NOT NULL, " +
      "title VARCHAR(200) NOT NULL, " +
      "scheduled_at VARCHAR(30) NOT NULL, " +
      "room VARCHAR(60) NOT NULL, " +
      "status VARCHAR(12) NOT NULL DEFAULT 'scheduled', " +
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
      "INDEX (course_id), INDEX (trainer_id)" +
      ")"
    );
  } catch (err) {
    console.warn("Could not verify/create live_classes table:", err.message);
  }
}
ensureLiveClassesTable();

function jaasPrivateKey() {
  if (process.env.JAAS_PRIVATE_KEY) return process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, "\n");
  const p = path.resolve(__dirname, process.env.JAAS_PRIVATE_KEY_PATH || "config/jaas-private.pk");
  return fs.readFileSync(p, "utf8");
}

function b64url(x) {
  return Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
}

function signJaasToken(user, room, isModerator) {
  const appId = process.env.JAAS_APP_ID;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: process.env.JAAS_KEY_ID, typ: "JWT" };
  const payload = {
    aud: "jitsi",
    iss: "chat",
    iat: now,
    nbf: now - 10,
    exp: now + 60 * 60 * 4,
    sub: appId,
    room: room,
    context: { features: { recording: isModerator ? "true" : "false" },
      user: {
        id: String(user.id),
        name: user.full_name,
        email: user.email || "",
        moderator: isModerator ? "true" : "false"
      }
    }
  };
  const data = b64url(header) + "." + b64url(payload);
  const sig = crypto.createSign("RSA-SHA256").update(data).sign(jaasPrivateKey());
  return data + "." + sig.toString("base64url");
}

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: "You are not authorized to do that." });
    }
    next();
  };
}

app.get("/api/classes", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    let courses = [], rows = [];
    const cols = "lc.id, lc.title, lc.scheduled_at, lc.status, c.title AS course_title ";
    if (u.role === "trainer") {
      [courses] = await pool.query("SELECT id, title FROM courses WHERE trainer_id = ? ORDER BY title", [u.id]);
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc JOIN courses c ON c.id = lc.course_id " +
        "WHERE lc.trainer_id = ? ORDER BY lc.scheduled_at ASC LIMIT 200", [u.id]);
    } else if (u.role === "admin") {
      [courses] = await pool.query("SELECT id, title FROM courses ORDER BY title");
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc JOIN courses c ON c.id = lc.course_id " +
        "ORDER BY lc.scheduled_at ASC LIMIT 200");
    } else {
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc " +
        "JOIN courses c ON c.id = lc.course_id " +
        "JOIN enrollments e ON e.course_id = lc.course_id " +
        "WHERE e.user_id = ? AND (e.has_paid = 1 OR c.fee_kes IS NULL) " +
        "ORDER BY lc.scheduled_at ASC LIMIT 200", [u.id]);
    }
    res.json({ role: u.role, courses, classes: rows });
  } catch (err) {
    console.error("List classes error:", err.message);
    res.status(500).json({ error: "Could not load classes right now." });
  }
});

app.post("/api/classes/create", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const u = req.session.user;
    const { course_id, title, scheduled_at } = req.body;
    if (!course_id || !title || !String(title).trim()) return res.status(400).json({ error: "Course and title are required." });
    const when = new Date(scheduled_at || Date.now());
    if (isNaN(when.getTime())) return res.status(400).json({ error: "Invalid date and time." });

    const [[course]] = await pool.query("SELECT id, trainer_id FROM courses WHERE id = ?", [course_id]);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (u.role === "trainer" && course.trainer_id !== u.id) return res.status(403).json({ error: "This is not your course." });

    const room = "spark-" + crypto.randomBytes(8).toString("hex");
    await pool.query(
      "INSERT INTO live_classes (course_id, trainer_id, title, scheduled_at, room) VALUES (?, ?, ?, ?, ?)",
      [course.id, course.trainer_id || u.id, String(title).trim().slice(0, 200), when.toISOString(), room]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Create class error:", err.message);
    res.status(500).json({ error: "Could not create the class right now." });
  }
});

app.post("/api/classes/:id/join", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    if (!process.env.JAAS_APP_ID || !process.env.JAAS_KEY_ID) {
      return res.status(500).json({ error: "Video service is not configured on the server." });
    }
    const [[cls]] = await pool.query("SELECT * FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found." });
    if (cls.status === "ended" || cls.status === "cancelled") return res.status(410).json({ error: "This class is no longer available." });

    let isMod = false;
    if (u.role === "admin") isMod = true;
    else if (u.role === "trainer") {
      if (cls.trainer_id !== u.id) return res.status(403).json({ error: "This is not your class." });
      isMod = true;
    } else if (u.role === "student") {
      const [[enr]] = await pool.query(
        "SELECT e.has_paid, c.fee_kes FROM enrollments e JOIN courses c ON c.id = e.course_id " +
        "WHERE e.user_id = ? AND e.course_id = ?", [u.id, cls.course_id]);
      if (!enr) return res.status(403).json({ error: "You are not enrolled in this course." });
      const hsc = await hsCourse();
      if (hsc && hsc.id === cls.course_id) {
        const [pp] = await pool.query("SELECT id FROM hs_class_payments WHERE class_id = ? AND user_id = ? AND status = 'approved'", [cls.id, u.id]);
        if (!pp.length) return res.status(402).json({ error: "Please pay KES 50 for this lesson and enter the M-Pesa code to join." });
      } else if (!enr.has_paid && enr.fee_kes !== null) return res.status(403).json({ error: "Please complete payment to join this class." });
      if (cls.status !== "live") return res.status(409).json({ error: "The trainer has not started this class yet. Try again soon." });
    } else {
      return res.status(403).json({ error: "You are not authorized to join." });
    }

    if (isMod && cls.status !== "live") await pool.query("UPDATE live_classes SET status = 'live' WHERE id = ?", [cls.id]);

    const token = signJaasToken(u, cls.room, isMod);
    res.json({ appId: process.env.JAAS_APP_ID, room: cls.room, jwt: token, displayName: u.full_name, moderator: isMod, title: cls.title });
  } catch (err) {
    console.error("Join class error:", err.message);
    res.status(500).json({ error: "Could not join the class right now." });
  }
});

app.post("/api/classes/:id/end", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const u = req.session.user;
    const [[cls]] = await pool.query("SELECT id, trainer_id FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found." });
    if (u.role === "trainer" && cls.trainer_id !== u.id) return res.status(403).json({ error: "This is not your class." });
    await pool.query("UPDATE live_classes SET status = 'ended' WHERE id = ?", [cls.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("End class error:", err.message);
    res.status(500).json({ error: "Could not end the class right now." });
  }
});

app.get("/api/admin/jaas-status", requireLogin, requireRole("admin"), (req, res) => {
  res.json({
    JAAS_APP_ID: !!process.env.JAAS_APP_ID,
    JAAS_KEY_ID: !!process.env.JAAS_KEY_ID,
    JAAS_PRIVATE_KEY: !!process.env.JAAS_PRIVATE_KEY
  });
});
// ---------- Live classes v2 (scheduling from the course homepage) ----------
async function ensureLiveClassNotes() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'notes'"
    );
    if (cols.length === 0) await pool.query("ALTER TABLE live_classes ADD COLUMN notes VARCHAR(500) NULL");
  } catch (err) {
    console.warn("live_classes notes setup failed:", err.message);
  }
}
ensureLiveClassesTable().then(ensureLiveClassNotes);

app.get("/api/course-classes", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    const cols = "lc.id, lc.course_id, lc.title, lc.scheduled_at, lc.status, lc.notes ";
    let rows = [];
    if (u.role === "trainer") {
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc JOIN courses c ON c.id = lc.course_id " +
        "WHERE c.trainer_id = ? AND lc.status <> 'cancelled' ORDER BY lc.scheduled_at ASC LIMIT 300", [u.id]);
    } else if (u.role === "admin") {
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc WHERE lc.status <> 'cancelled' ORDER BY lc.scheduled_at ASC LIMIT 300");
    } else {
      [rows] = await pool.query(
        "SELECT " + cols + "FROM live_classes lc " +
        "JOIN courses c ON c.id = lc.course_id " +
        "JOIN enrollments e ON e.course_id = lc.course_id " +
        "WHERE e.user_id = ? AND (e.has_paid = 1 OR c.fee_kes IS NULL) AND lc.status <> 'cancelled' " +
        "ORDER BY lc.scheduled_at ASC LIMIT 300", [u.id]);
    }
    res.json({ role: u.role, classes: rows });
  } catch (err) {
    console.error("Course classes error:", err.message);
    res.status(500).json({ error: "Could not load classes right now." });
  }
});

app.post("/api/course-classes/create", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const u = req.session.user;
    const { course_id, title, scheduled_at, notes } = req.body;
    if (!course_id || !title || !String(title).trim()) return res.status(400).json({ error: "Course and title are required." });
    const when = new Date(scheduled_at);
    if (isNaN(when.getTime())) return res.status(400).json({ error: "Enter a valid date and time." });
    if (when.getTime() < Date.now() - 60 * 60 * 1000) return res.status(400).json({ error: "Pick a date and time in the future." });
    const [[course]] = await pool.query("SELECT id, trainer_id FROM courses WHERE id = ?", [course_id]);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (u.role === "trainer" && course.trainer_id !== u.id) return res.status(403).json({ error: "This is not your course." });
    const room = "spark-" + crypto.randomBytes(8).toString("hex");
    await pool.query(
      "INSERT INTO live_classes (course_id, trainer_id, title, scheduled_at, room, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [course.id, course.trainer_id || u.id, String(title).trim().slice(0, 200), when.toISOString(), room, notes ? String(notes).trim().slice(0, 500) : null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Schedule class error:", err.message);
    res.status(500).json({ error: "Could not schedule the class right now." });
  }
});

app.post("/api/classes/:id/update", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const u = req.session.user;
    const { title, scheduled_at, notes } = req.body;
    const [[cls]] = await pool.query("SELECT id, trainer_id, status FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found." });
    if (u.role === "trainer" && cls.trainer_id !== u.id) return res.status(403).json({ error: "This is not your class." });
    if (cls.status === "ended" || cls.status === "cancelled") return res.status(409).json({ error: "This class can no longer be edited." });
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
    const when = new Date(scheduled_at);
    if (isNaN(when.getTime())) return res.status(400).json({ error: "Enter a valid date and time." });
    await pool.query(
      "UPDATE live_classes SET title = ?, scheduled_at = ?, notes = ? WHERE id = ?",
      [String(title).trim().slice(0, 200), when.toISOString(), notes ? String(notes).trim().slice(0, 500) : null, cls.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Update class error:", err.message);
    res.status(500).json({ error: "Could not update the class right now." });
  }
});

app.post("/api/classes/:id/cancel", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const u = req.session.user;
    const [[cls]] = await pool.query("SELECT id, trainer_id, status FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found." });
    if (u.role === "trainer" && cls.trainer_id !== u.id) return res.status(403).json({ error: "This is not your class." });
    if (cls.status !== "scheduled") return res.status(409).json({ error: "Only upcoming classes can be cancelled." });
    await pool.query("UPDATE live_classes SET status = 'cancelled' WHERE id = ?", [cls.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Cancel class error:", err.message);
    res.status(500).json({ error: "Could not cancel the class right now." });
  }
});

// ---------- Admin PDF reports (trainers / students / all) ----------
const PDFDocument = require("pdfkit");
const PDF_BRAND = { ink: "#0f1c16", green: "#1f8a5b", light: "#eef5f1", line: "#d5e2db", text: "#1b2a22", muted: "#6b7c72", red: "#b3261e" };

function pdfDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function buildUsersPdf(res, filename, title, adminName, sections) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true, info: { Title: title, Author: "Spark Technologies" } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
  doc.pipe(res);

  const L = 36, PW = doc.page.width, PH = doc.page.height, W = PW - 72, bottom = PH - 50;
  const today = pdfDate(new Date());

  doc.rect(0, 0, PW, 84).fill(PDF_BRAND.ink);
  try {
    const logo = path.join(frontendPath, "assets", "logo-sidebar.png");
    if (fs.existsSync(logo)) doc.image(logo, L, 18, { fit: [150, 48] });
  } catch (e) {}
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(title, L, 24, { width: W, align: "right", lineBreak: false });
  doc.fillColor("#9DBBAB").font("Helvetica").fontSize(9).text("Generated " + today + " by " + (adminName || "Admin"), L, 54, { width: W, align: "right", lineBreak: false });
  doc.rect(0, 84, PW, 4).fill(PDF_BRAND.green);

  let y = 110;

  function drawHead(cols) {
    doc.rect(L, y, W, 24).fill(PDF_BRAND.green);
    let x = L;
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
    cols.forEach(c => { doc.text(c.label.toUpperCase(), x + 6, y + 8, { width: c.w - 12, lineBreak: false }); x += c.w; });
    y += 24;
  }

  sections.forEach((sec, si) => {
    if (y + 90 > bottom) { doc.addPage(); y = 36; }
    doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(14).text(sec.heading, L, y, { width: W, lineBreak: false });
    y += 20;
    doc.fillColor(PDF_BRAND.muted).font("Helvetica").fontSize(9).text(sec.summary, L, y, { width: W, lineBreak: false });
    y += 20;

    if (!sec.rows.length) {
      doc.fillColor(PDF_BRAND.muted).font("Helvetica-Oblique").fontSize(10).text("No records.", L, y, { lineBreak: false });
      y += 30;
      return;
    }

    drawHead(sec.cols);
    sec.rows.forEach((r, i) => {
      doc.font("Helvetica").fontSize(9);
      const cells = sec.cols.map(c => { const v = c.get(r, i); return v == null || v === "" ? "-" : String(v); });
      let h = 0;
      cells.forEach((t, k) => { h = Math.max(h, doc.heightOfString(t, { width: sec.cols[k].w - 12 })); });
      h = Math.max(24, h + 12);
      if (y + h > bottom) { doc.addPage(); y = 36; drawHead(sec.cols); }
      if (i % 2 === 1) doc.rect(L, y, W, h).fill(PDF_BRAND.light);
      let x = L;
      cells.forEach((t, k) => {
        const col = sec.cols[k];
        doc.fillColor(col.color ? col.color(r) : PDF_BRAND.text).font(col.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
           .text(t, x + 6, y + 6, { width: col.w - 12 });
        x += col.w;
      });
      doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.5).strokeColor(PDF_BRAND.line).stroke();
      y += h;
    });
    y += 26;
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.moveTo(L, PH - 38).lineTo(L + W, PH - 38).lineWidth(0.5).strokeColor(PDF_BRAND.line).stroke();
    doc.fillColor(PDF_BRAND.muted).font("Helvetica").fontSize(8)
       .text("Spark Technologies - Confidential. Contains personal data.", L, PH - 28, { width: W / 2, lineBreak: false });
    doc.text("Page " + (i + 1) + " of " + range.count, L + W / 2, PH - 28, { width: W / 2, align: "right", lineBreak: false });
  }
  doc.end();
}

const PDF_TRAINER_COLS = [
  { label: "#", w: 28, get: (r, i) => i + 1 },
  { label: "Name", w: 130, bold: true, get: r => r.full_name },
  { label: "Email", w: 160, get: r => r.email },
  { label: "Phone", w: 90, get: r => r.phone },
  { label: "Status", w: 62, get: r => (r.is_active === 0 || r.is_active === false) ? "Suspended" : "Active", color: r => (r.is_active === 0 || r.is_active === false) ? PDF_BRAND.red : PDF_BRAND.green },
  { label: "Joined", w: 74, get: r => pdfDate(r.created_at) },
  { label: "Courses assigned", w: 170, get: r => r.courses },
  { label: "Students", w: 56, get: r => r.students }
];
const PDF_STUDENT_COLS = [
  { label: "#", w: 28, get: (r, i) => i + 1 },
  { label: "Name", w: 130, bold: true, get: r => r.full_name },
  { label: "Email", w: 160, get: r => r.email },
  { label: "Phone", w: 90, get: r => r.phone },
  { label: "Status", w: 62, get: r => (r.is_active === 0 || r.is_active === false) ? "Suspended" : "Active", color: r => (r.is_active === 0 || r.is_active === false) ? PDF_BRAND.red : PDF_BRAND.green },
  { label: "Joined", w: 74, get: r => pdfDate(r.created_at) },
  { label: "Courses enrolled (payment)", w: 226, get: r => r.courses }
];

async function pdfTrainerSection() {
  const [rows] = await pool.query(
    "SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, " +
    "(SELECT GROUP_CONCAT(c.title ORDER BY c.title SEPARATOR ', ') FROM courses c WHERE c.trainer_id = u.id) AS courses, " +
    "(SELECT COUNT(*) FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.trainer_id = u.id) AS students " +
    "FROM users u WHERE u.role = 'trainer' ORDER BY u.full_name"
  );
  const active = rows.filter(r => !(r.is_active === 0 || r.is_active === false)).length;
  return { heading: "Trainers", summary: rows.length + " trainer" + (rows.length === 1 ? "" : "s") + " | " + active + " active", cols: PDF_TRAINER_COLS, rows };
}
async function pdfStudentSection() {
  const [rows] = await pool.query(
    "SELECT u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, " +
    "(SELECT GROUP_CONCAT(CONCAT(c.title, CASE WHEN c.fee_kes IS NULL THEN ' (free)' WHEN e.has_paid = 1 THEN ' (paid)' ELSE ' (unpaid)' END) ORDER BY c.title SEPARATOR ', ') " +
    "FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = u.id) AS courses " +
    "FROM users u WHERE u.role = 'student' ORDER BY u.full_name"
  );
  const active = rows.filter(r => !(r.is_active === 0 || r.is_active === false)).length;
  return { heading: "Students", summary: rows.length + " student" + (rows.length === 1 ? "" : "s") + " | " + active + " active", cols: PDF_STUDENT_COLS, rows };
}

function pdfStamp() { return new Date().toISOString().slice(0, 10); }

app.get("/api/admin/reports/trainers.pdf", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    buildUsersPdf(res, "spark-trainers-" + pdfStamp() + ".pdf", "Trainers Report", req.session.user.full_name, [await pdfTrainerSection()]);
  } catch (err) {
    console.error("Trainers PDF error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Could not create the PDF right now." });
  }
});
app.get("/api/admin/reports/students.pdf", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    buildUsersPdf(res, "spark-students-" + pdfStamp() + ".pdf", "Students Report", req.session.user.full_name, [await pdfStudentSection()]);
  } catch (err) {
    console.error("Students PDF error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Could not create the PDF right now." });
  }
});
app.get("/api/admin/reports/all-users.pdf", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    buildUsersPdf(res, "spark-all-users-" + pdfStamp() + ".pdf", "All Users Report", req.session.user.full_name, [await pdfTrainerSection(), await pdfStudentSection()]);
  } catch (err) {
    console.error("All users PDF error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Could not create the PDF right now." });
  }
});

// ---------- High School Holiday Revision Program ----------
const HS_LIKE = "High School Holiday Revision%";
async function ensureHsTables() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS hs_students (user_id INT PRIMARY KEY, school VARCHAR(150), form_level VARCHAR(40))"
    );
    await pool.query(
      "CREATE TABLE IF NOT EXISTS hs_timetable (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, course_id INT NOT NULL, day_no TINYINT NOT NULL, " +
      "start_time VARCHAR(5) NOT NULL, end_time VARCHAR(5) NOT NULL, subject VARCHAR(120) NOT NULL, " +
      "teacher VARCHAR(120), notes VARCHAR(300), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (course_id))"
    );
  } catch (err) { console.warn("HS tables setup failed:", err.message); }
}
ensureHsTables();

async function hsCourse() {
  const [rows] = await pool.query("SELECT id, title, trainer_id, fee_kes FROM courses WHERE title LIKE ? ORDER BY id LIMIT 1", [HS_LIKE]);
  return rows[0] || null;
}

function hsPhoneKey(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("254") && d.length === 12) d = "0" + d.slice(3);
  else if (d.length === 9 && /^[17]/.test(d)) d = "0" + d;
  return /^0\d{9}$/.test(d) ? d : null;
}
function hsEmailFor(key) { return "hs." + key + "@students.spark.local"; }
const HS_LEVELS = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "Form 1", "Form 2", "Form 3"];

app.post("/api/register-highschool", async (req, res) => {
  try {
    const { full_name, phone, school, form_level, password } = req.body;
    const name = String(full_name || "").trim();
    const sch = String(school || "").trim();
    const lvl = String(form_level || "").trim();
    const key = hsPhoneKey(phone);
    if (!name || !sch || !lvl || !password) return res.status(400).json({ error: "Please fill in all the fields." });
    if (!key) return res.status(400).json({ error: "Enter a valid phone number, for example 0712 345 678." });
    if (!HS_LEVELS.includes(lvl)) return res.status(400).json({ error: "Please choose your class level." });
    if (String(password).length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });
    const course = await hsCourse();
    if (!course) return res.status(404).json({ error: "The High School Holiday Revision Program is not open for registration yet." });

    const email = hsEmailFor(key);
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) return res.status(409).json({ error: "An account with this phone number already exists. Please log in instead." });

    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'student')",
      [name, email, key, hash]
    );
    await pool.query("INSERT INTO hs_students (user_id, school, form_level) VALUES (?, ?, ?)", [result.insertId, sch.slice(0, 150), lvl]);
    await pool.query("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)", [result.insertId, course.id]);

    req.session.user = { id: result.insertId, full_name: name, email: email, role: "student" };
    logActivity(result.insertId, name, "register", name + " joined the High School Holiday Revision Program.");
    res.json({ success: true });
  } catch (err) {
    console.error("HS register error:", err.message);
    res.status(500).json({ error: "Could not create your account right now. Please try again." });
  }
});

app.post("/api/login-highschool", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const key = hsPhoneKey(phone);
    if (!key || !password) return res.status(400).json({ error: "Enter your phone number and password." });
    const [rows] = await pool.query(
      "SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.is_active " +
      "FROM users u JOIN hs_students h ON h.user_id = u.id WHERE u.email = ? OR u.phone = ? LIMIT 1",
      [hsEmailFor(key), key]
    );
    const bad = { error: "Wrong phone number or password." };
    if (!rows.length) return res.status(401).json(bad);
    const u = rows[0];
    if (!(await bcrypt.compare(String(password), u.password_hash))) return res.status(401).json(bad);
    if (u.is_active === 0) return res.status(403).json({ error: "This account has been deactivated. Please contact the admin." });
    req.session.user = { id: u.id, full_name: u.full_name, email: u.email, role: u.role };
    res.json({ success: true });
  } catch (err) {
    console.error("HS login error:", err.message);
    res.status(500).json({ error: "Could not log in right now. Please try again." });
  }
});

app.get("/api/hs/me", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    const course = await hsCourse();
    if (!course) return res.json({ is_hs: false, only_hs: false });
    if (u.role !== "student") {
      return res.json({ role: u.role, is_hs: false, only_hs: false, course_id: course.id, title: course.title, can_edit: u.role === "admin" || course.trainer_id === u.id });
    }
    const [rows] = await pool.query("SELECT course_id, has_paid, payment_code FROM enrollments WHERE user_id = ?", [u.id]);
    const mine = rows.find(r => r.course_id === course.id);
    res.json({
      role: "student", is_hs: !!mine, only_hs: !!mine && rows.length === 1,
      course_id: course.id, title: course.title, can_edit: false,
      unlocked: !!mine && (!!mine.has_paid || course.fee_kes === null), payment_code: mine ? mine.payment_code : null, fee_kes: course.fee_kes
    });
  } catch (err) {
    console.error("HS me error:", err.message);
    res.status(500).json({ error: "Could not load your details." });
  }
});

app.get("/api/hs/timetable", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    const course = await hsCourse();
    if (!course) return res.json({ entries: [] });
    if (u.role === "student") {
      const [enr] = await pool.query("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?", [u.id, course.id]);
      if (!enr.length) return res.status(403).json({ error: "You are not enrolled in this program." });
    }
    const [entries] = await pool.query(
      "SELECT id, day_no, DATE_FORMAT(class_date, '%Y-%m-%d') AS class_date, start_time, end_time, subject, teacher, notes FROM hs_timetable WHERE course_id = ? ORDER BY start_time, day_no", [course.id]);
    res.json({ entries });
  } catch (err) {
    console.error("HS timetable error:", err.message);
    res.status(500).json({ error: "Could not load the timetable." });
  }
});

async function hsCanEdit(u) {
  const course = await hsCourse();
  if (!course) return null;
  if (u.role === "admin" || (u.role === "trainer" && course.trainer_id === u.id)) return course;
  return null;
}

async function ensureHsTimetableDate() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hs_timetable' AND COLUMN_NAME = 'class_date'"
    );
    if (cols.length === 0) await pool.query("ALTER TABLE hs_timetable ADD COLUMN class_date DATE NULL");
  } catch (err) { console.warn("hs_timetable class_date setup failed:", err.message); }
}
ensureHsTables().then(ensureHsTimetableDate);
ensureHsTables().then(ensureHsPayStatus);

app.post("/api/hs/timetable/add", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Only this program's trainer or the admin can edit the timetable." });
    const { day_no, class_date, start_time, end_time, subject, teacher, notes } = req.body;
    const tre = /^\d{2}:\d{2}$/;
    let day = Number(day_no);
    let dateVal = null;
    if (class_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(class_date)) return res.status(400).json({ error: "Enter a valid date." });
      const dt = new Date(class_date + "T00:00:00Z");
      if (isNaN(dt.getTime())) return res.status(400).json({ error: "Enter a valid date." });
      const wd = dt.getUTCDay();
      if (wd === 0 || wd === 6) return res.status(400).json({ error: "Classes run Monday to Friday. Pick a weekday date." });
      day = wd;
      dateVal = class_date;
    }
    if (!(day >= 1 && day <= 5)) return res.status(400).json({ error: "Choose a day from Monday to Friday." });
    if (!tre.test(start_time || "") || !tre.test(end_time || "") || !subject || !String(subject).trim()) {
      return res.status(400).json({ error: "Enter the start and end time and the lesson." });
    }
    if (end_time <= start_time) return res.status(400).json({ error: "End time must be after the start time." });
    const HS_SLOTS = ["08:00-09:00", "09:30-10:30", "11:00-12:00", "14:00-15:00", "15:30-16:00"];
    if (!HS_SLOTS.includes(start_time + "-" + end_time)) return res.status(400).json({ error: "Choose one of the five lesson times." });
    const HS_TEACHERS = { "English": "Christine Njoroge", "Mathematics": "Roy Njuki", "Biology": "Geoffrey Kimani", "Chemistry": "Henry Muigai", "Physics": "Maryanne Atieno" };
    const subjectName = String(subject).trim();
    if (!HS_TEACHERS[subjectName]) return res.status(400).json({ error: "Choose one of the five subjects." });
    await pool.query(
      "INSERT INTO hs_timetable (course_id, day_no, class_date, start_time, end_time, subject, teacher, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [course.id, day, dateVal, start_time, end_time, String(subject).trim().slice(0, 120), HS_TEACHERS[subjectName], notes ? String(notes).trim().slice(0, 300) : null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("HS timetable add error:", err.message);
    res.status(500).json({ error: "Could not save that entry." });
  }
});

app.post("/api/hs/timetable/:id/delete", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Only this program's trainer or the admin can edit the timetable." });
    await pool.query("DELETE FROM hs_timetable WHERE id = ? AND course_id = ?", [req.params.id, course.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("HS timetable delete error:", err.message);
    res.status(500).json({ error: "Could not delete that entry." });
  }
});

app.get("/api/hs/classes", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    const course = await hsCourse();
    if (!course) return res.json({ classes: [] });
    if (u.role === "student") {
      const [enr] = await pool.query("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?", [u.id, course.id]);
      if (!enr.length) return res.status(403).json({ error: "You are not enrolled in this program." });
    } else if (!(await hsCanEdit(u))) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const [classes] = await pool.query(
      (u.role === "admin" ? "SELECT lc.id, lc.title, lc.scheduled_at, lc.status, lc.notes, (SELECT full_name FROM users WHERE id = lc.trainer_id) AS trainer_name FROM live_classes lc WHERE lc.course_id = ? AND lc.status <> 'cancelled' ORDER BY lc.scheduled_at DESC LIMIT 80" : "SELECT id, title, scheduled_at, status, notes FROM live_classes WHERE course_id = ? AND status IN ('scheduled', 'live') ORDER BY scheduled_at ASC LIMIT 30"),
      [course.id]
    );
    res.json({ classes });
  } catch (err) {
    console.error("HS classes error:", err.message);
    res.status(500).json({ error: "Could not load classes." });
  }
});

// ---------- High school: KES 50 per lesson ----------
const HS_LESSON_FEE = 50;
async function ensureHsPayTable() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS hs_class_payments (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, class_id INT NOT NULL, user_id INT NOT NULL, code VARCHAR(20) NOT NULL, " +
      "amount INT NOT NULL DEFAULT 50, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
      "UNIQUE KEY uq_class_user (class_id, user_id), UNIQUE KEY uq_code (code))"
    );
  } catch (err) { console.warn("hs_class_payments setup failed:", err.message); }
}
ensureHsPayTable();

app.get("/api/hs/my-payments", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT class_id, status FROM hs_class_payments WHERE user_id = ?", [req.session.user.id]);
    const stMap = {}; rows.forEach(r => { stMap[r.class_id] = r.status; }); res.json({ fee: HS_LESSON_FEE, ids: rows.map(r => r.class_id), status: stMap });
  } catch (err) { res.json({ fee: HS_LESSON_FEE, ids: [] }); }
});

app.post("/api/hs/classes/:id/pay", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const u = req.session.user;
    const course = await hsCourse();
    if (!course) return res.status(404).json({ error: "Program not found." });
    const [[cls]] = await pool.query("SELECT id, course_id, status FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls || cls.course_id !== course.id) return res.status(404).json({ error: "Class not found." });
    const [enr] = await pool.query("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?", [u.id, course.id]);
    if (!enr.length) return res.status(403).json({ error: "You are not enrolled in this program." });
    if (cls.status !== "live") return res.status(409).json({ error: "This class is not live right now." });

    const [have] = await pool.query("SELECT id, status FROM hs_class_payments WHERE class_id = ? AND user_id = ?", [cls.id, u.id]);
    if (have.length && have[0].status !== "rejected") return res.json({ success: true });

    const code = String(req.body.code || "").replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(code)) return res.status(400).json({ error: "Enter the 10-character M-Pesa confirmation code, for example QJ7ABC1234." });
    try {
      if (have.length) await pool.query("DELETE FROM hs_class_payments WHERE id = ?", [have[0].id]);
      await pool.query("INSERT INTO hs_class_payments (class_id, user_id, code, amount) VALUES (?, ?, ?, ?)", [cls.id, u.id, code, HS_LESSON_FEE]);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That M-Pesa code has already been used." });
      throw e;
    }
    logActivity(u.id, u.full_name, "payment", u.full_name + " paid for a high school lesson.");
    res.json({ success: true });
  } catch (err) {
    console.error("HS pay error:", err.message);
    res.status(500).json({ error: "Could not save your payment code. Please try again." });
  }
});

app.get("/api/hs/payments", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Not allowed." });
    const [rows] = await pool.query(
      "SELECT p.id, p.code, p.amount, p.status, p.created_at, u.full_name, u.phone, lc.title AS class_title " +
      "FROM hs_class_payments p JOIN live_classes lc ON lc.id = p.class_id JOIN users u ON u.id = p.user_id " +
      "WHERE lc.course_id = ? ORDER BY p.created_at DESC LIMIT 300", [course.id]);
    res.json({ payments: rows, can_approve: req.session.user.role === "admin" });
  } catch (err) {
    console.error("HS payments error:", err.message);
    res.status(500).json({ error: "Could not load payments." });
  }
});

async function ensureHsPayStatus() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hs_class_payments' AND COLUMN_NAME = 'status'"
    );
    if (cols.length === 0) {
      await pool.query("ALTER TABLE hs_class_payments ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'pending'");
      await pool.query("UPDATE hs_class_payments SET status = 'approved'");
    }
  } catch (err) { console.warn("hs_class_payments status setup failed:", err.message); }
}

async function hsSetPayStatus(req, res, status) {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Not allowed." });
    await pool.query(
      "UPDATE hs_class_payments SET status = ? WHERE id = ? AND class_id IN (SELECT id FROM live_classes WHERE course_id = ?)",
      [status, req.params.id, course.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("HS payment status error:", err.message);
    res.status(500).json({ error: "Could not update that payment." });
  }
}

app.post("/api/hs/payments/:id/approve", requireLogin, requireRole("admin"), (req, res) => hsSetPayStatus(req, res, "approved"));
app.post("/api/hs/payments/:id/reject", requireLogin, requireRole("admin"), (req, res) => hsSetPayStatus(req, res, "rejected"));

app.post("/api/hs/payments/:id/revoke", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Not allowed." });
    await pool.query(
      "DELETE FROM hs_class_payments WHERE id = ? AND class_id IN (SELECT id FROM live_classes WHERE course_id = ?)", [req.params.id, course.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("HS revoke error:", err.message);
    res.status(500).json({ error: "Could not revoke that payment." });
  }
});

async function ensurePaidAtColumn() {
  try {
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'paid_at'"
    );
    if (cols.length === 0) await pool.query("ALTER TABLE enrollments ADD COLUMN paid_at DATETIME NULL");
  } catch (err) { console.warn("enrollments paid_at setup failed:", err.message); }
}
ensurePaidAtColumn();

async function ensureLiveAttendance() {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS live_attendance (" +
      "id INT AUTO_INCREMENT PRIMARY KEY, class_id INT NOT NULL, user_id INT NOT NULL, " +
      "joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "UNIQUE KEY uq_class_user (class_id, user_id))"
    );
  } catch (err) { console.warn("live_attendance setup failed:", err.message); }
}
ensureLiveAttendance();

app.post("/api/classes/:id/attend", requireLogin, async (req, res) => {
  try {
    const u = req.session.user;
    const [[cls]] = await pool.query("SELECT id, course_id, status FROM live_classes WHERE id = ?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found." });
    const hs = await hsCourse();
    const isHs = !!(hs && hs.id === cls.course_id);
    const next = u.role === "trainer" ? (isHs ? "highschool-trainer.html" : "classes.html") : (isHs ? "highschool.html" : "classes.html");
    if (cls.status === "live" && u.role === "student") {
      const [enr] = await pool.query("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?", [u.id, cls.course_id]);
      if (enr.length) {
        await pool.query("INSERT INTO live_attendance (class_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_seen = NOW()", [cls.id, u.id]);
      }
    }
    res.json({ status: cls.status, next: next });
  } catch (err) {
    console.error("Attend error:", err.message);
    res.status(500).json({ error: "Could not record attendance." });
  }
});

app.get("/api/hs/attendance", requireLogin, requireAnyRole(["trainer", "admin"]), async (req, res) => {
  try {
    const course = await hsCanEdit(req.session.user);
    if (!course) return res.status(403).json({ error: "Not allowed." });
    const [rows] = await pool.query(
      "SELECT lc.id, lc.title, lc.scheduled_at, lc.status, u.full_name, a.joined_at, a.last_seen, TIMESTAMPDIFF(SECOND, a.last_seen, NOW()) AS idle " +
      "FROM live_classes lc LEFT JOIN live_attendance a ON a.class_id = lc.id LEFT JOIN users u ON u.id = a.user_id " +
      "WHERE lc.course_id = ? AND lc.status <> 'cancelled' ORDER BY lc.scheduled_at DESC, a.joined_at LIMIT 600", [course.id]);
    const map = {}, out = [];
    rows.forEach(function (r) {
      if (!map[r.id]) { map[r.id] = { id: r.id, title: r.title, scheduled_at: r.scheduled_at, status: r.status, students: [] }; out.push(map[r.id]); }
      if (r.full_name) map[r.id].students.push({ name: r.full_name, joined_at: r.joined_at, last_seen: r.last_seen, idle: r.idle });
    });
    res.json({ classes: out.slice(0, 30) });
  } catch (err) {
    console.error("HS attendance error:", err.message);
    res.status(500).json({ error: "Could not load attendance." });
  }
});

app.listen(PORT, () => {
  console.log("Spark Technologies server running at http://localhost:" + PORT);
  ensureAdminAccount();
  ensureTeamTable();
  ensureContactTable();
  ensurePasswordResetTable();
});

app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "..", "frontend", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({ message: "Spark Technologies API is running." });
  }
});
