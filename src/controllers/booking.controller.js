const createBooking = require("../models/booking");
const db = require("../config/db");
const { encrypt, decrypt } = require("../service/cryptoHelper");
const couponService = require("../service/coupon.service");
const PDFDocument = require('pdfkit');
const path = require('path');
const emailService = require("../service/emailService"); // Email service

async function ensureTrekRatingsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS trek_ratings (
      id INT NOT NULL AUTO_INCREMENT,
      booking_id INT NOT NULL,
      trek_id INT NOT NULL,
      user_id INT NOT NULL,
      rating TINYINT NOT NULL,
      review TEXT,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_booking_rating (booking_id),
      KEY idx_trek_id (trek_id),
      KEY idx_user_id (user_id),
      CONSTRAINT fk_trek_ratings_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      CONSTRAINT fk_trek_ratings_trek FOREIGN KEY (trek_id) REFERENCES treks(id) ON DELETE CASCADE,
      CONSTRAINT fk_trek_ratings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

function normalizeCouponCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function isExpectedCreateBookingMessage(message = "") {
  const text = String(message || "");
  return [
    "pending or confirmed booking",
    "already completed this trek",
    "insufficient available slots",
    "invalid coupon code",
    "coupon is not active yet",
    "coupon has expired",
    "coupon minimum requirement",
    "coupon usage limit reached",
    "already used this coupon",
  ].some((phrase) => text.toLowerCase().includes(phrase));
}

async function createBookingController(req, res) {
  try {
    const bookingData = decrypt(req.body.encryptedPayload);
    const result = await createBooking.createBooking(bookingData);
    const encryptedResponse = encrypt(result);

    return res.status(200).json({
      success: true,
      message: "Booking created successfully",
      data: encryptedResponse,
    });
  } catch (error) {
    if (!isExpectedCreateBookingMessage(error?.message)) {
      console.error("Error creating booking:", error);
    }

    return res.status(200).json({
      success: false,
      message: error.message || "Failed to create booking",
    });
  }
}

async function getMyBookingsById(req, res) {
  const conn = await db.getConnection();
  const userId = req.params.id;
  
  try {
    await ensureTrekRatingsTable(conn);

    const [bookings] = await conn.execute(
      `
        SELECT 
          b.*,
          t.name as trek_name,
          t.location,
          t.cover_image,
          tr.rating AS user_rating,
          tr.review AS user_review,
          tr.updated_at AS rated_at,
          tb.start_date,
          tb.end_date,
          tb.duration,
          DATEDIFF(tb.start_date, NOW()) as days_until_trek
        FROM bookings b
        INNER JOIN trek_batches tb ON b.batch_id = tb.id
        INNER JOIN treks t ON tb.trek_id = t.id
        LEFT JOIN trek_ratings tr
          ON tr.booking_id = b.id
         AND tr.user_id = b.user_id
        WHERE b.user_id = ?
        ORDER BY tb.start_date DESC
      `,
      [userId],
    );

    // Get add-ons and participants for each booking
    for (let booking of bookings) {
      // Get add-ons
      const [addons] = await conn.execute(
        `
          SELECT addon_name, quantity, unit_price, total_price
          FROM booking_addons
          WHERE booking_id = ?
        `,
        [booking.id],
      );

      // Get participants
      const [participants] = await conn.execute(
        `
          SELECT 
            id,
            name,
            age,
            gender,
            id_type,
            id_number,
            phone,
            medical_info,
            is_primary_contact
          FROM booking_participants
          WHERE booking_id = ?
          ORDER BY is_primary_contact DESC, id ASC
        `,
        [booking.id],
      );

      booking.addons = addons;
      booking.participants_details = participants;
      booking.can_cancel =
        booking.days_until_trek >= 7 &&
        (booking.booking_status === "pending" ||
          booking.booking_status === "confirmed");
    }

    conn.release();

    const response = {
      count: bookings.length,
      bookings: bookings,
    };

    const encryptedResponse = encrypt(response);

    return res.json({
      success: true,
      data: encryptedResponse,
    });
  } catch (error) {
    conn.release();
    console.error("Get user bookings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
}

async function getReceiptById(req, res) {
  let conn;
  
  try {
    conn = await db.getConnection();
    
    const userId = req.params.userId;
    const bookingId = req.params.bookingId;

    const [bookings] = await conn.execute(`
      SELECT 
        b.*,
        t.name as trek_name,
        t.location,
        tb.start_date,
        tb.end_date,
        tb.duration,
        u.full_name as user_name,
        u.email as user_email
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      INNER JOIN treks t ON tb.trek_id = t.id
      INNER JOIN users u ON b.user_id = u.id
      WHERE b.id = ? AND b.user_id = ?
    `, [bookingId, userId]);

    if (!bookings || bookings.length === 0) {
      if (conn) conn.release();
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Get add-ons
    const [addons] = await conn.execute(`
      SELECT * FROM booking_addons WHERE booking_id = ?
    `, [bookingId]);

    // Get participants
    const [participants] = await conn.execute(`
      SELECT 
        name,
        age,
        gender,
        id_type,
        id_number,
        phone,
        medical_info,
        is_primary_contact
      FROM booking_participants
      WHERE booking_id = ?
      ORDER BY is_primary_contact DESC, id ASC
    `, [bookingId]);

    // Create PDF
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });

    const fileName = `Receipt_${booking.booking_reference || bookingId}.pdf`;

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function for drawing lines
    const drawLine = (y) => {
      doc.moveTo(50, y).lineTo(545, y).stroke();
    };

    // Add logo and header
    const logoPath = path.join(__dirname, '../assets/logo.png');
    const fs = require('fs');
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 80, height: 80 })
        .moveDown(2);
    }

    doc.fontSize(24)
      .fillColor('#2c3e50')
      .text('BOOKING RECEIPT', { align: 'center' });
    
    doc.moveDown(0.5);
    drawLine(doc.y);
    doc.moveDown();

    // Booking Reference
    doc.fontSize(12)
       .fillColor('#34495e')
       .text('Booking Reference: ', { continued: true })
       .fontSize(14)
       .fillColor('#e74c3c')
       .text(booking.booking_reference || 'N/A');
    
    doc.fontSize(10)
       .fillColor('#7f8c8d')
       .text(`Booking Date: ${new Date(booking.created_at).toLocaleDateString()}`, { align: 'right' });
    
    doc.moveDown(1.5);

    // Trek Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Trek/Tour Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const trekDetails = [
      ['Trek/Tour Name:', booking.trek_name || 'N/A'],
      ['Location:', booking.location || 'N/A'],
      ['Start Date:', booking.start_date ? new Date(booking.start_date).toLocaleDateString() : 'N/A'],
      ['End Date:', booking.end_date ? new Date(booking.end_date).toLocaleDateString() : 'N/A'],
      ['Duration:', booking.duration || 'N/A'],
      ['Participants:', booking.participants || 0]
    ];

    trekDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1);

    // Customer Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Customer Details', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#34495e');
    const customerDetails = [
      ['Name:', booking.customer_name || 'N/A'],
      ['Email:', booking.customer_email || 'N/A'],
      ['Phone:', booking.customer_phone || 'N/A'],
      ['Emergency Contact:', booking.emergency_contact || 'N/A']
    ];

    customerDetails.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { continued: true, width: 150 })
         .fillColor('#2c3e50')
         .text(value, { width: 350 });
      doc.moveDown(0.3);
    });

    doc.moveDown(1.5);

    // PARTICIPANTS SECTION (NEW)
    if (participants && participants.length > 0) {
      doc.fontSize(16)
         .fillColor('#2c3e50')
         .text('Participant Details', { underline: true });
      doc.moveDown(0.5);

      // Table headers
      const tableTop = doc.y;
      const rowHeight = 25;
      const columnWidths = {
        no: 30,
        name: 120,
        age: 35,
        gender: 50,
        idType: 80,
        idNumber: 100
      };

      // Header background
      doc.rect(50, tableTop, 495, rowHeight)
         .fillAndStroke('#667eea', '#667eea');

      // Header text
      doc.fillColor('#ffffff')
         .fontSize(9)
         .text('#', 55, tableTop + 8, { width: columnWidths.no })
         .text('Name', 85, tableTop + 8, { width: columnWidths.name })
         .text('Age', 205, tableTop + 8, { width: columnWidths.age })
         .text('Gender', 240, tableTop + 8, { width: columnWidths.gender })
         .text('ID Type', 290, tableTop + 8, { width: columnWidths.idType })
         .text('ID Number', 370, tableTop + 8, { width: columnWidths.idNumber });

      // Data rows
      let yPos = tableTop + rowHeight;
      participants.forEach((participant, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, yPos, 495, rowHeight)
             .fillAndStroke('#f8f9fa', '#e0e0e0');
        } else {
          doc.rect(50, yPos, 495, rowHeight)
             .stroke('#e0e0e0');
        }

        // Row data
        doc.fillColor('#2c3e50')
           .fontSize(8)
           .text(`${index + 1}`, 55, yPos + 8, { width: columnWidths.no });
        
        const nameText = participant.name + (participant.is_primary_contact ? ' ★' : '');
        doc.text(nameText, 85, yPos + 8, { width: columnWidths.name });
        doc.text(participant.age || '-', 205, yPos + 8, { width: columnWidths.age });
        doc.text(participant.gender || '-', 240, yPos + 8, { width: columnWidths.gender });
        doc.text(participant.id_type || '-', 290, yPos + 8, { width: columnWidths.idType });
        doc.text(participant.id_number || '-', 370, yPos + 8, { width: columnWidths.idNumber });

        yPos += rowHeight;

        // Add new page if needed
        if (yPos > 700 && index < participants.length - 1) {
          doc.addPage();
          yPos = 50;
        }
      });

      doc.y = yPos + 10;

      // Medical info summary (if any)
      const participantsWithMedicalInfo = participants.filter(
        p => p.medical_info && p.medical_info.trim() !== ''
      );

      if (participantsWithMedicalInfo.length > 0) {
        doc.moveDown(0.5);
        doc.fontSize(10)
           .fillColor('#ff9800')
           .text('⚕ Medical Information:', { underline: true });
        doc.moveDown(0.3);

        participantsWithMedicalInfo.forEach(p => {
          doc.fontSize(8)
             .fillColor('#34495e')
             .text(`• ${p.name}: `, { continued: true })
             .fillColor('#2c3e50')
             .text(p.medical_info);
          doc.moveDown(0.2);
        });
      }

      doc.fontSize(8)
         .fillColor('#7f8c8d')
         .text('★ = Primary Contact', { align: 'right' });
      
      doc.moveDown(1.5);
    }

    // Payment Details Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Payment Summary', { underline: true });
    doc.moveDown(0.5);

    const paymentItems = [
      ['Base Price', `₹${booking.base_price || 0}`],
      ['Add-ons Total', `₹${booking.addons_total || 0}`],
      ['Tax (5%)', `₹${booking.tax_amount || 0}`]
    ];

    doc.fontSize(11).fillColor('#34495e');
    paymentItems.forEach(([label, value]) => {
      doc.text(label, 50, doc.y, { width: 400 });
      doc.text(value, 450, doc.y - 11, { width: 95, align: 'right' });
      doc.moveDown(0.5);
    });

    doc.moveDown(0.3);
    drawLine(doc.y);
    doc.moveDown(0.5);

    // Total Amount
    doc.fontSize(14)
       .fillColor('#2c3e50')
       .text('Total Amount', 50, doc.y, { width: 400, bold: true });
    doc.fillColor('#27ae60')
       .text(`₹${booking.total_amount || 0}`, 450, doc.y - 14, { width: 95, align: 'right' });
    
    doc.moveDown(1);

    // Payment Status
    doc.fontSize(11).fillColor('#34495e');
    doc.text('Amount Paid', 50, doc.y, { width: 400 });
    doc.fillColor('#2c3e50')
       .text(`₹${booking.amount_paid || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
    doc.moveDown(0.5);

    const balanceDue = booking.balance_due || 0;
    doc.fillColor('#34495e')
       .text('Balance Due', 50, doc.y, { width: 400 });
    doc.fillColor(balanceDue > 0 ? '#e74c3c' : '#27ae60')
       .text(`₹${balanceDue}`, 450, doc.y - 11, { width: 95, align: 'right' });

    doc.moveDown(1.5);

    // Status Section
    doc.fontSize(16)
       .fillColor('#2c3e50')
       .text('Status', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11);
    const bookingStatus = booking.booking_status ? booking.booking_status.toUpperCase() : 'N/A';
    const paymentStatus = booking.payment_status ? booking.payment_status.toUpperCase() : 'N/A';

    const statusColor = bookingStatus === 'CONFIRMED' ? '#27ae60' : '#e74c3c';
    const paymentColor = paymentStatus === 'PAID' ? '#27ae60' : '#e74c3c';

    doc.fillColor('#34495e')
       .text('Booking Status: ', { continued: true })
       .fillColor(statusColor)
       .text(bookingStatus);
    
    doc.fillColor('#34495e')
       .text('Payment Status: ', { continued: true })
       .fillColor(paymentColor)
       .text(paymentStatus);

    // Add-ons Section
    if (addons && addons.length > 0) {
      doc.moveDown(1.5);
      
      doc.fontSize(16)
         .fillColor('#2c3e50')
         .text('Add-ons', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#34495e');
      
      addons.forEach((addon, index) => {
        doc.text(`${index + 1}. ${addon.addon_name || 'N/A'}`, 50, doc.y, { width: 400 });
        doc.fillColor('#2c3e50')
           .text(`₹${addon.total_price || 0}`, 450, doc.y - 11, { width: 95, align: 'right' });
        doc.moveDown(0.5);
      });
    }

    // Footer
    doc.moveDown(2);
    drawLine(doc.y);
    doc.moveDown(0.5);
    
    doc.fontSize(8)
       .fillColor('#7f8c8d')
       .text('Start Here Tours & Treks | support@starthere.com | +91 1234567890', { align: 'center' });
    doc.text('Thank you for choosing Start Here Tours & Treks!', { align: 'center' });

    // Finalize PDF
    doc.end();

    if (conn) conn.release();

  } catch (error) {
    if (conn) conn.release();
    console.error('Download receipt error:', error);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download receipt',
        error: error.message
      });
    }
  }
}

async function cancelBooking(req, res) {
  let conn;

  try {
    conn = await db.getConnection();

    const bookingId = parseInt(req.params.bookingId);
    const { userId, reason, acceptedTerms } = req.body;

    // ===============================
    // 1️⃣ BASIC VALIDATION
    // ===============================
    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID and User ID are required"
      });
    }

    if (!acceptedTerms) {
      return res.status(400).json({
        success: false,
        message: "You must accept cancellation terms"
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required"
      });
    }

    await conn.beginTransaction();

    // ===============================
    // 2️⃣ LOCK BOOKING + BATCH
    // ===============================
    const [rows] = await conn.execute(`
      SELECT 
        b.*,
        tb.max_participants,
        tb.start_date,
        DATEDIFF(tb.start_date, NOW()) AS days_until_trek
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      WHERE b.id = ? AND b.user_id = ?
      FOR UPDATE
    `, [bookingId, userId]);

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = rows[0];

    // ===============================
    // 3️⃣ BUSINESS RULES
    // ===============================
    if (booking.booking_status === "cancelled") {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Booking already cancelled"
      });
    }

    if (booking.days_until_trek < 7) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot cancel within 7 days of trek"
      });
    }

    const participantCount = parseInt(booking.participants || 0);
    if (participantCount <= 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid participant count"
      });
    }

    // ===============================
    // 4️⃣ REFUND PERCENTAGE LOGIC
    // ===============================
    let refundPercentage = 0;

    if (booking.days_until_trek >= 30) {
      refundPercentage = 100;
    } else if (booking.days_until_trek >= 15) {
      refundPercentage = 75;
    } else {
      refundPercentage = 50;
    }

    // ===============================
    // 5️⃣ CALCULATE REFUND
    // ===============================
    const baseAmount = parseFloat(booking.subtotal || 0);
    const gstAmount = parseFloat(booking.tax_amount || 0);
    const totalAmount = parseFloat(booking.total_amount || 0);
    const amountPaid = parseFloat(booking.amount_paid || 0);

    const baseRefund = (baseAmount * refundPercentage) / 100;
    const gstRefund = (gstAmount * refundPercentage) / 100;
    const grossRefund = baseRefund + gstRefund;

    // Never refund more than paid
    const finalRefund = Math.min(grossRefund, amountPaid);
    const cancellationFee = totalAmount - finalRefund;

    // ===============================
    // 6️⃣ UPDATE BOOKING
    // ===============================
    await conn.execute(`
      UPDATE bookings
      SET 
        booking_status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = ?,
        refund_amount = ?,
        cancellation_fee = ?,
        payment_status = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      reason.trim(),
      finalRefund.toFixed(2),
      cancellationFee.toFixed(2),
      finalRefund > 0 ? "refunded" : "cancelled",
      bookingId
    ]);

    // ===============================
    // 7️⃣ FETCH PARTICIPANTS (FIXED)
    // ===============================
    const [participantRows] = await conn.execute(`
      SELECT 
        id,
        name,
        age,
        gender,
        id_type,
        id_number,
        phone,
        medical_info,
        is_primary_contact
      FROM booking_participants
      WHERE booking_id = ?
    `, [bookingId]);

    const participants = participantRows || [];

    // ===============================
    // 8️⃣ RECALCULATE BATCH SLOTS
    // ===============================
    const [slotRows] = await conn.execute(`
      SELECT COALESCE(SUM(participants), 0) AS total_booked
      FROM bookings
      WHERE batch_id = ?
      AND booking_status != 'cancelled'
    `, [booking.batch_id]);

    const recalculatedBookedSlots = parseInt(slotRows[0].total_booked);
    const recalculatedAvailableSlots =
      booking.max_participants - recalculatedBookedSlots;

    await conn.execute(`
      UPDATE trek_batches
      SET 
        booked_slots = ?,
        available_slots = ?
      WHERE id = ?
    `, [
      recalculatedBookedSlots,
      recalculatedAvailableSlots < 0 ? 0 : recalculatedAvailableSlots,
      booking.batch_id
    ]);

    await conn.commit();
    conn.release();

    // ===============================
    // 📧 SEND EMAIL (ASYNC)
    // ===============================
    const bookingDataForEmail = {
      ...booking,
      refund_amount: parseFloat(finalRefund.toFixed(2)),
      refund_percentage: refundPercentage,
      cancellation_fee: parseFloat(cancellationFee.toFixed(2)),
      cancellation_reason: reason.trim(),
      participants_details: participants
    };

    emailService
      .sendCancellationEmail(bookingDataForEmail)
      .then(() => {
        console.log("Cancellation email sent to:", booking.customer_email);
      })
      .catch((err) => {
        console.error("Failed to send cancellation email:", err);
      });

    // ===============================
    // 9️⃣ RESPONSE
    // ===============================
    const responsePayload = {
      bookingId,
      bookingReference: booking.booking_reference,
      refundPercentage,
      refundBreakdown: {
        baseRefund: parseFloat(baseRefund.toFixed(2)),
        gstRefund: parseFloat(gstRefund.toFixed(2))
      },
      totalRefund: parseFloat(finalRefund.toFixed(2)),
      cancellationFee: parseFloat(cancellationFee.toFixed(2)),
      refundMethod: booking.payment_method || "Original payment method",
      processingTime: "7-10 business days"
    };

    const encryptedResponse = encrypt(responsePayload);

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: encryptedResponse
    });

  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
        conn.release();
      } catch (err) {
        console.error("Rollback failed:", err);
      }
    }

    console.error("Cancel booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message
    });
  }
}

async function submitTrekRating(req, res) {
  let conn;

  try {
    conn = await db.getConnection();
    await ensureTrekRatingsTable(conn);

    const bookingId = Number(req.params.bookingId);
    const userId = Number(req.params.userId);
    const decryptedBody = req.body?.encryptedPayload
      ? decrypt(req.body.encryptedPayload)
      : null;
    const body = (decryptedBody && typeof decryptedBody === "object")
      ? decryptedBody
      : (req.body || {});
    const rating = Number(body.rating);
    const review = String(body.review || "").trim();

    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Valid userId and bookingId are required"
      });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5"
      });
    }

    const [rows] = await conn.execute(
      `
        SELECT
          b.id,
          b.user_id,
          tb.trek_id AS resolved_trek_id,
          b.booking_status,
          tb.end_date
        FROM bookings b
        INNER JOIN trek_batches tb ON tb.id = b.batch_id
        WHERE b.id = ? AND b.user_id = ?
        LIMIT 1
      `,
      [bookingId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Booking not found for this user"
      });
    }

    const booking = rows[0];
    const endDate = new Date(booking.end_date);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (booking.booking_status !== "completed" && endDate > today) {
      return res.status(400).json({
        success: false,
        message: "Rating is allowed only for completed treks"
      });
    }

    await conn.execute(
      `
        INSERT INTO trek_ratings (booking_id, trek_id, user_id, rating, review)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          rating = VALUES(rating),
          review = VALUES(review),
          updated_at = CURRENT_TIMESTAMP
      `,
      [bookingId, booking.resolved_trek_id, userId, rating, review || null]
    );

    const [aggregateRows] = await conn.execute(
      `
        SELECT
          ROUND(AVG(rating), 1) AS average_rating,
          COUNT(*) AS review_count
        FROM trek_ratings
        WHERE trek_id = ?
      `,
      [booking.resolved_trek_id]
    );

    const aggregate = aggregateRows[0] || {};
    const encryptedResponse = encrypt({
      bookingId,
      trekId: booking.resolved_trek_id,
      rating,
      review,
      ratedAt: new Date().toISOString(),
      averageRating: Number(aggregate.average_rating || 0),
      reviewCount: Number(aggregate.review_count || 0)
    });

    return res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      data: encryptedResponse
    });
  } catch (error) {
    console.error("Submit rating error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit rating",
      error: error.message
    });
  } finally {
    if (conn) conn.release();
  }
}

async function validateCouponController(req, res) {
  try {
    await couponService.ensureCouponSchema();

    const payload = decrypt(req.body?.encryptedPayload || "");
    const trekOrBatchId = Number(payload?.trekId || 0);
    const userId = Number(payload?.userId || 0);
    const participants = Number(payload?.participants || 0);
    const unitPrice = Number(payload?.price || 0);
    const couponCode = normalizeCouponCode(payload?.couponCode || payload?.coupon?.code || "");
    const selectedAddOns = Array.isArray(payload?.selectedAddOns) ? payload.selectedAddOns : [];

    if (!trekOrBatchId || !couponCode || !participants || unitPrice < 0) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "trekId, participants, price and couponCode are required",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    let couponTrekId = trekOrBatchId;
    const [[trekById]] = await db.query(
      "SELECT id FROM treks WHERE id = ? LIMIT 1",
      [trekOrBatchId]
    );
    if (!trekById) {
      const [[batchRow]] = await db.query(
        "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
        [trekOrBatchId]
      );
      if (batchRow?.trekId) couponTrekId = Number(batchRow.trekId);
    }

    const basePrice = unitPrice * participants;
    const addonsTotal = selectedAddOns
      .filter((addon) => addon.selected || Number(addon.quantity) > 0)
      .reduce((sum, addon) => {
        const quantity = Number(addon.quantity) > 0 ? Number(addon.quantity) : participants;
        return sum + Number(addon.price || 0) * quantity;
      }, 0);
    const subtotalBeforeDiscount = basePrice + addonsTotal;

    const [couponRows] = await db.query(
      `
        SELECT
          id,
          trek_id,
          code,
          discount_type,
          discount_value,
          min_booking_amount,
          max_discount_amount,
          start_date,
          end_date,
          usage_limit,
          usage_count,
          is_active
        FROM trek_coupons
        WHERE trek_id = ? AND code = ?
        LIMIT 1
      `,
      [couponTrekId, couponCode]
    );

    const coupon = couponRows[0];
    if (!coupon || Number(coupon.is_active) !== 1) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Invalid coupon code for this trek",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon is not active yet",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (coupon.end_date && new Date(coupon.end_date) < now) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon has expired",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (Number(coupon.min_booking_amount || 0) > subtotalBeforeDiscount) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Booking amount does not meet coupon minimum requirement",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }
    if (
      coupon.usage_limit !== null &&
      Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)
    ) {
      const encryptedResponse = encrypt({
        valid: false,
        message: "Coupon usage limit reached",
      });
      return res.status(200).json({ success: true, data: encryptedResponse });
    }

    if (userId) {
      const [usageRows] = await db.query(
        `
          SELECT id
          FROM coupon_usages
          WHERE coupon_id = ? AND user_id = ?
          LIMIT 1
        `,
        [coupon.id, userId]
      );

      if (usageRows.length > 0) {
        const encryptedResponse = encrypt({
          valid: false,
          message: "You have already used this coupon",
        });
        return res.status(200).json({ success: true, data: encryptedResponse });
      }
    }

    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = subtotalBeforeDiscount * (Number(coupon.discount_value) / 100);
    } else {
      discountAmount = Number(coupon.discount_value || 0);
    }
    if (coupon.max_discount_amount !== null) {
      discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }
    discountAmount = Math.min(discountAmount, subtotalBeforeDiscount);

    const encryptedResponse = encrypt({
      valid: true,
      message: "Coupon applied",
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value || 0),
      discountAmount,
      subtotalBeforeDiscount,
      subtotalAfterDiscount: subtotalBeforeDiscount - discountAmount,
    });
    return res.status(200).json({ success: true, data: encryptedResponse });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(200).json({
      success: false,
      message: "Failed to validate coupon",
    });
  }
}

async function getAvailableCouponsController(req, res) {
  try {
    await couponService.ensureCouponSchema();

    const trekOrBatchId = Number(req.params?.trekId || 0);
    const userId = Number(req.query?.userId || 0);
    if (!trekOrBatchId) {
      return res.status(400).json({
        success: false,
        message: "Valid trekId is required",
      });
    }

    let couponTrekId = trekOrBatchId;
    const [[trekById]] = await db.query(
      "SELECT id FROM treks WHERE id = ? LIMIT 1",
      [trekOrBatchId]
    );
    if (!trekById) {
      const [[batchRow]] = await db.query(
        "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
        [trekOrBatchId]
      );
      if (batchRow?.trekId) couponTrekId = Number(batchRow.trekId);
    }

    const [rows] = await db.query(
      `
        SELECT
          c.id,
          c.code,
          c.discount_type AS discountType,
          c.discount_value AS discountValue,
          c.min_booking_amount AS minBookingAmount,
          c.max_discount_amount AS maxDiscountAmount,
          c.end_date AS endDate,
          c.usage_limit AS usageLimit,
          c.usage_count AS usageCount
        FROM trek_coupons c
        WHERE c.trek_id = ?
          AND c.is_active = 1
          AND (c.start_date IS NULL OR c.start_date <= NOW())
          AND (c.end_date IS NULL OR c.end_date >= NOW())
          AND (c.usage_limit IS NULL OR c.usage_count < c.usage_limit)
        ORDER BY c.updated_at DESC
      `,
      [couponTrekId]
    );

    let usedCouponIds = new Set();
    if (userId && rows.length > 0) {
      const couponIds = rows.map((r) => r.id);
      const placeholders = couponIds.map(() => "?").join(",");
      const [usageRows] = await db.query(
        `
          SELECT coupon_id
          FROM coupon_usages
          WHERE user_id = ?
            AND coupon_id IN (${placeholders})
        `,
        [userId, ...couponIds]
      );
      usedCouponIds = new Set(usageRows.map((r) => Number(r.coupon_id)));
    }

    const coupons = rows.map((row) => ({
      ...row,
      isUsedByUser: usedCouponIds.has(Number(row.id)),
    }));

    return res.status(200).json({
      success: true,
      data: coupons,
    });
  } catch (error) {
    console.error("Get available coupons error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
    });
  }
}


module.exports = { createBookingController, getMyBookingsById, getReceiptById , cancelBooking, submitTrekRating, validateCouponController, getAvailableCouponsController };
