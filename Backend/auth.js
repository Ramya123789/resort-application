// auth.js

const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const flash = require('express-flash');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');





// Configure MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'Ramyasri@123',
  database: 'resort_management',
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Failed to connect to MySQL:', err);
    throw err;
  }
  console.log('Connected to MySQL database');
});

// Middleware
app.use(express.json());
app.use(session({ secret: 'sessionSecret', resave: true, saveUninitialized: true }));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
// Generate a random secret key
const secretKey = crypto.randomBytes(32).toString('hex');
console.log('Generated secret key:', secretKey);
// Generate a random session secret of 32 characters
const sessionSecret = crypto.randomBytes(32).toString('hex');

// Use the generated session secret in the session middleware
// Passport local strategy configuration
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const query = 'SELECT * FROM users WHERE email = ?';
        const [users] = await db.promise().query(query, [email]);
        const user = users[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return done(null, false, { message: 'Invalid email or password' });
        }
        return done(null, user);
      } catch (error) {
        console.error('Database error:', error);
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
    done(null, { id: user.id, role: user.role });
});

passport.deserializeUser(async (userData, done) => {
  try {
    const { id, role } = userData;
    const query = 'SELECT * FROM users WHERE id = ?';
    const [users] = await db.promise().query(query, [id]);
    const user = users[0];
    user.role = role;
    done(null, user);
  } catch (error) {
    done(error);
  }
});
app.post('/login', (req, res, next) => {
  console.log('Received login request');
  passport.authenticate('local', (err, user, info) => {
    console.log('Inside passport.authenticate');
    if (err) {
      console.error('Authentication error:', err);
      return next(err);
    }
    if (!user) {
      console.log('Authentication failed:', info.message);
      return res.status(401).json({ message: info.message });
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error('Session creation error:', loginErr);
        return next(loginErr);
      }

      console.log('User authenticated:', user);
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role }, // Add 'role' to the token payload
        'secretKey' // Replace 'your_secret_key' with your own secret key for signing the token
      );

      // Send the token as the response
      return res.status(200).json({ token,role: user.role });
      // Redirect the user to the '/admin' dashboard
    });
  })(req, res, next);
});

// Login route
// app.post('/login', passport.authenticate('local', {
//   successRedirect: '/dashboard',
//   failureRedirect: '/login',
//   failureFlash: true,
// }));

// Logout route
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

  
  // Example API endpoint for user registration
  app.post('/register', async (req, res) => {
    const { email, password, role,isAdmin } = req.body;
    try {
      let userRole = ''; // Declare a new variable to hold the role value

    if (isAdmin) {
      userRole = 'admin'; // If admin checkbox is selected, set the role to "admin"
    } else {
      // If admin checkbox is not selected, get the selected role from the request body
      userRole = role;
    }
      // Check if a user with the given email already exists
      const checkUserQuery = 'SELECT * FROM users WHERE email = ?';
      const [existingUsers] = await db.promise().query(checkUserQuery, [email]);
  
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: 'User already exists with the provided email' });
      }
  
      // Encrypt the password using bcrypt before storing it in the database
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Insert the new user into the users table
      const insertUserQuery = 'INSERT INTO users (email, password, role) VALUES (?, ?, ?)';
      const insertUserValues = [email, hashedPassword, userRole];
      await db.promise().query(insertUserQuery, insertUserValues);
  
      res.json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  });
  
  // Example API endpoint with role-based access control
  app.get('/protected', (req, res) => {
    if (req.user) {
      // Access allowed for authenticated users
      const { role } = req.user;
      if (role === 'admin') {
        // Redirect to the admin dashboard
        return res.json({ message: 'You have admin access' });
      } else if (role === 'cleaningstaff') {
        // Redirect to the cleaning staff dashboard
        return res.json({ message: 'You have cleaning staff access' });
      } else if (role === 'chef') {
        // Redirect to the chef dashboard
        return res.json({ message: 'You have chef access' });
      } else if (role === 'caretaker') {
        // Redirect to the caretaker dashboard
        return res.json({ message: 'You have caretaker access' });
      } else {
        // Unknown role
        return res.status(403).json({ error: 'Access forbidden' });
      }
    } else {
      // Not authenticated
      return res.status(403).json({ error: 'Access forbidden' });
    }
  });
  
  
module.exports = app;
