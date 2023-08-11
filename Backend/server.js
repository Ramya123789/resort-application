const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const moment=require('moment');
const authRoutes = require('./auth');
const app = express();
const port = 8081;

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
app.use(cors());
app.use(express.json());
app.use(express.static('uploads'));
app.use(authRoutes);

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Specify the directory where the uploaded files will be stored
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname); // Use the original filename for the uploaded file
    },
  });

// Multer file filter configuration
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/gif'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF files are allowed.'), false);
  }
};

// Multer upload instance
const upload = multer({ storage });

// API endpoint for adding a room
app.post('/rooms', (req, res) => {
  const { category, room_number: roomNumber, room_cost: roomCost, capacity, image } = req.body;
  const query = `INSERT INTO rooms (category, room_number, room_cost, capacity, image, booking_date) VALUES (?, ?, ?, ?, ?, NULL)`;
  const values = [category, roomNumber, roomCost, capacity, image];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Failed to add room:', err);
      res.status(500).json({ error: 'Failed to add room' });
    } else {
      res.status(201).send('Room added successfully');
    }
  });
});


// API endpoint for fetching all rooms
app.get('/rooms', (req, res) => {
  const sql = 'SELECT * FROM rooms';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch rooms:', err);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    } else {
      res.status(200).json(results);
    }
  });
});

// API endpoint for uploading an image
app.post('/upload', upload.single('image'), (req, res) => {
  const file = req.file;
  const imageUrl = `http://localhost:8081/${file.filename}`;
  res.json({ url: imageUrl });
});
// ...

app.get('/update-room/:roomNumber/:occupancy', (req, res) => {
  const { roomNumber, occupancy } = req.params;

  // Fetch the room's capacity from the database
  const fetchCapacityQuery = `SELECT capacity FROM rooms WHERE room_number = ?`;
  db.query(fetchCapacityQuery, [roomNumber], (err, result) => {
    if (err) {
      console.error('Failed to fetch room capacity:', err);
      res.status(500).json({ error: 'Failed to fetch room capacity' });
    } else {
      const capacity = result[0].capacity;
      // Check if the occupancy exceeds the capacity
      if (occupancy > capacity) {
        res.status(400).json({ error: 'Occupancy exceeds room capacity' });
        console.error('Failed to update room occupancy:');
      } else {
        // Update the room occupancy
        const updateOccupancyQuery = `UPDATE rooms SET occupancy = ? WHERE room_number = ?`;
        const values = [occupancy, roomNumber];

        db.query(updateOccupancyQuery, values, (err, result) => {
          if (err) {
            console.error('Failed to update room occupancy:', err);
            res.status(500).json({ error: 'Failed to update room occupancy' });
          } else {
            res.status(200).send('Room occupancy updated successfully');
          }
        });
      }
    }
  });
});

app.get('/book-room/:roomNumber/:occupancy/:bookingDate', (req, res) => {
  const { roomNumber, occupancy, bookingDate } = req.params;

  // Fetch the room's capacity and room ID from the database
  const fetchRoomQuery = `SELECT id, capacity, category FROM rooms WHERE room_number = ?`;
  db.query(fetchRoomQuery, [roomNumber], (err, roomResult) => {
    if (err) {
      console.error('Failed to fetch room details:', err);
      res.status(500).json({ error: 'Failed to fetch room details' });
    } else if (roomResult.length === 0) {
      res.status(400).json({ error: 'Room does not exist' });
    } else {
      const { id: roomId, capacity, category } = roomResult[0];

      // Check if the room has reached its capacity for the requested date in the bookings table
      const fetchOccupancyQuery = `SELECT SUM(occupancy) AS total_occupancy FROM bookings WHERE room_id = ? AND booking_date = ?`;
      db.query(fetchOccupancyQuery, [roomId, bookingDate], (err, occupancyResult) => {
        if (err) {
          console.error('Failed to fetch room occupancy:', err);
          res.status(500).json({ error: 'Failed to fetch room occupancy' });
        } else {
          const { total_occupancy } = occupancyResult[0];
          const remainingCapacity = capacity - (total_occupancy || 0);

          // Check if the occupancy exceeds the remaining capacity for the requested date
          if (occupancy > remainingCapacity) {
            res.status(400).json({ error: 'Occupancy exceeds room capacity for the requested date' });
          } else {
            // Insert the new booking record in the bookings table
            const insertBookingQuery = `INSERT INTO bookings (room_id, occupancy, booking_date) VALUES (?, ?, ?)`;
            const bookingValues = [roomId, occupancy, bookingDate];

            db.query(insertBookingQuery, bookingValues, (err, bookingResult) => {
              if (err) {
                console.error('Failed to insert booking:', err);
                res.status(500).json({ error: 'Failed to insert booking' });
              } else {
                const bookingId = bookingResult.insertId;

                // Update the capacity and occupancy in the booking_calendar table for the specific room number and date
                const updateBookingCalendarQuery = `
  INSERT INTO booking_calendar (booking_id, room_id, room_number, category, capacity, booking_date, occupancy, room_cost)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE category = ?, capacity = ?, occupancy = ?, room_cost = ?
`;
const calendarValues = [
  bookingId, roomId, roomNumber, category, capacity, bookingDate, occupancy, 0.00,
  category, capacity, occupancy, 0.00
];


                db.query(updateBookingCalendarQuery, calendarValues, (err, _) => {
                  if (err) {
                    console.error('Failed to update booking calendar:', err);
                    res.status(500).json({ error: 'Failed to update booking calendar' });
                  } else {
                    res.status(200).json({ message: 'Room booked successfully' });
                  }
                });
              }
            });
          }
        }
      });
    }
  });
});


app.delete('/rooms/:id', (req, res) => {
  const roomId = req.params.id;

  // Delete the room with the specified ID from the database
  const deleteRoomQuery = 'DELETE FROM rooms WHERE id = ?';
  db.query(deleteRoomQuery, [roomId], (err, result) => {
    if (err) {
      console.error('Failed to delete room:', err);
      res.status(500).json({ error: 'Failed to delete room' });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Room not found' });
    } else {
      res.status(200).json({ message: 'Room deleted successfully' });
    }
  });
});





app.get('/bookings', (req, res) => {
  const sql = `
    SELECT bc.*, r.category, r.capacity, r.occupancy
    FROM booking_calendar bc
    INNER JOIN rooms r ON bc.room_number = r.room_number
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch bookings:', err);
      res.status(500).json({ error: 'Failed to fetch bookings' });
    } else {
      const bookings = results.map((booking) => {
        return {
          id: booking.id,
          title: booking.category,
          start: moment(booking.booking_date).toDate(),
          end: moment(booking.booking_date).toDate(),
          roomNumber: booking.room_number,
          capacity: booking.capacity,
          occupancy: booking.occupancy,
        };
      });
      res.status(200).json(bookings);
    }
  });
});
// Backend server code
app.get('/categories', (req, res) => {
  // Fetch the categories from the database
  const fetchCategoriesQuery = 'SELECT DISTINCT category FROM rooms';

  db.query(fetchCategoriesQuery, (err, results) => {
    if (err) {
      console.error('Failed to fetch categories:', err);
      res.status(500).json({ error: 'Failed to fetch categories' });
    } else {
      const categories = results.map((result) => result.category);
      res.status(200).json(categories);
    }
  });
});

app.get('/room-numbers/:category', (req, res) => {
  const { category } = req.params;
  const sql = 'SELECT room_number FROM rooms WHERE category = ?';
  db.query(sql, [category], (err, results) => {
    if (err) {
      console.error('Failed to fetch room numbers:', err);
      res.status(500).json({ error: 'Failed to fetch room numbers' });
    } else {
      const roomNumbers = results.map((row) => row.room_number);
      res.status(200).json(roomNumbers);
    }
  });
});
app.get('/bookings/:roomNumber', (req, res) => {
  const { roomNumber } = req.params;
  const sql = 'SELECT booking_date, occupancy, capacity,booking_id,booking_status FROM booking_calendar WHERE room_number = ?';
  db.query(sql, [roomNumber], (err, results) => {
    if (err) {
      console.error('Failed to fetch bookings:', err);
      res.status(500).json({ error: 'Failed to fetch bookings' });
    } else {
      const bookings = results.map((row) => ({
        date: row.booking_date,
        occupancy: row.occupancy,
        capacity: row.capacity,
        booking_id:row.booking_id,
        booking_status:row.booking_status
      }));
      res.status(200).json(bookings);
    }
  });
});
app.put('/bookings/:bookingId/cancel', (req, res) => {
  const { bookingId } = req.params;

  // Update the booking status to "Cancelled" in the database
  const cancelBookingQuery = 'UPDATE booking_calendar SET booking_status = ? WHERE booking_id = ?';
const values = ['Cancelled', bookingId];

db.query(cancelBookingQuery, values, (err, result) => {
  if (err) {
    console.error('Failed to cancel booking:', err);
    res.status(500).json({ error: 'Failed to cancel booking' });
  } else if (result.affectedRows === 0) {
    res.status(404).json({ error: 'Booking not found' });
  } else {
    res.status(200).json({ message: 'Booking cancelled successfully' });
  }
});

});
app.post('/upload/groceryitemimage', upload.single('image'), (req, res) => {
  const file = req.file;
  const imageUrl = `http://localhost:8081/${file.filename}`;
  res.json({ url: imageUrl });
});








app.put('/rooms/:id', (req, res) => {
  const roomId = req.params.id;
  const { category, room_number: roomNumber, room_cost: roomCost, capacity, image } = req.body;

  // Update the room data in the database
  const updateRoomQuery = 'UPDATE rooms SET category = ?, room_number = ?, room_cost = ?, capacity = ?, image = ? WHERE id = ?';
  const values = [category, roomNumber, roomCost, capacity, image, roomId];

  db.query(updateRoomQuery, values, (err, result) => {
    if (err) {
      console.error('Failed to update room:', err);
      res.status(500).json({ error: 'Failed to update room' });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Room not found' });
    } else {
      res.status(200).json({ message: 'Room updated successfully' });
    }
  });
});


app.post('/groceries', (req, res) => {
  const { category,name, quantity, description, duration, start_date,expiry_date,image } = req.body;

  // Calculate the end date by adding the start date and duration
  

  // Insert the grocery item into the database
  const insertGroceryQuery = `
    INSERT INTO grocery_items (category,name, quantity, description, duration, start_date, expiry_date,image)
    VALUES (?, ?, ?, ?, ?, ?,?,?)
  `;
  const values = [category,name, quantity, description, duration, start_date, expiry_date,image];

  db.query(insertGroceryQuery, values, (err, result) => {
    if (err) {
      console.error('Failed to add grocery item:', err);
      res.status(500).json({ error: 'Failed to add grocery item' });
    } else {
      res.status(201).send('Grocery item added successfully');
    }
  });
});

app.get('/groceries', (req, res) => {
  const sql = 'SELECT * FROM grocery_items';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch grocery items:', err);
      res.status(500).json({ error: 'Failed to fetch grocery items' });
    } else {
      res.status(200).json(results);
    }
  });
});
app.post('/leave-applications', (req, res) => {
  const { leave_type: leaveType, start_date: startDate, end_date: endDate, reason,halfDayPeriod,userId} = req.body;

  // Insert the leave application into the database
  const insertLeaveApplicationQuery = `
    INSERT INTO leave_applications (leave_type, start_date, end_date, reason,half_day_period,user_email)
    VALUES (?, ?, ?, ?,?,?)
  `;
  const values = [leaveType, startDate, endDate, reason,halfDayPeriod,userId];

  db.query(insertLeaveApplicationQuery, values, (err, result) => {
    if (err) {
      console.error('Failed to add leave application:', err);
      res.status(500).json({ error: 'Failed to add leave application' });
    } else {
      res.status(201).send('Leave application added successfully');
    }
  });
});

// API endpoint for fetching all leave applications
app.get('/leave-applications', (req, res) => {
  const sql = 'SELECT * FROM leave_applications';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Failed to fetch leave applications:', err);
      res.status(500).json({ error: 'Failed to fetch leave applications' });
    } else {
      res.status(200).json(results);
    }
  });
});

// API endpoint for updating the status of a leave application (approval by admin)
app.put('/leave-applications/:id', (req, res) => {
  const leaveApplicationId = req.params.id;
  const { status } = req.body;

  // Update the status of the leave application in the database
  const updateLeaveApplicationQuery = 'UPDATE leave_applications SET status = ? WHERE id = ?';
  const values = [status, leaveApplicationId];

  db.query(updateLeaveApplicationQuery, values, (err, result) => {
    if (err) {
      console.error('Failed to update leave application status:', err);
      res.status(500).json({ error: 'Failed to update leave application status' });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Leave application not found' });
    } else {
      res.status(200).json({ message: 'Leave application status updated successfully' });
    }
  });
});
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
