const createBooking = require("../models/booking");
const db = require("../config/db");
const { encrypt, decrypt } = require("../service/cryptoHelper");
const PDFDocument = require('pdfkit');
const path = require('path');
const emailService = require("../service/emailService"); // Email service

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
    console.error("Error creating booking:", error);

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
    const [bookings] = await conn.execute(
      `
        SELECT 
          b.*,
          t.name as trek_name,
          t.location,
          t.cover_image,
          tb.start_date,
          tb.end_date,
          tb.duration,
          DATEDIFF(tb.start_date, NOW()) as days_until_trek
        FROM bookings b
        INNER JOIN trek_batches tb ON b.batch_id = tb.id
        INNER JOIN treks t ON tb.trek_id = t.id
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


module.exports = { createBookingController, getMyBookingsById, getReceiptById , cancelBooking};
