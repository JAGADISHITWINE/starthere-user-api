const nodemailer = require('nodemailer');
require('dotenv').config();


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // Your email
    pass: process.env.SMTP_PASS  // Your email password or app password
  }
});


async function sendBookingConfirmation(booking) {
  try {
    // Format dates
    const startDate = new Date(booking.start_date).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const endDate = new Date(booking.end_date).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Email HTML template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border: 1px solid #e0e0e0;
    }
    .booking-ref {
      background: #667eea;
      color: white;
      padding: 15px;
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      border-radius: 5px;
      margin: 20px 0;
    }
    .info-section {
      background: white;
      padding: 20px;
      margin: 20px 0;
      border-radius: 5px;
      border-left: 4px solid #667eea;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #333;
    }
    .total-amount {
      background: #4CAF50;
      color: white;
      padding: 15px;
      text-align: center;
      font-size: 24px;
      font-weight: bold;
      border-radius: 5px;
      margin: 20px 0;
    }
    .important-note {
      background: #fff3cd;
      border: 1px solid #ffc107;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Booking Confirmed!</h1>
    <p>Your adventure awaits</p>
  </div>
  
  <div class="content">
    <p>Dear ${booking.customer_name},</p>
    
    <p>Thank you for booking with us! Your trek booking has been successfully confirmed.</p>
    
    <div class="booking-ref">
      Booking Reference: ${booking.booking_reference}
    </div>
    
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">Trek Details</h3>
      <div class="info-row">
        <span class="info-label">Trek Name:</span>
        <span class="info-value">${booking.trek_name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Start Date:</span>
        <span class="info-value">${startDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">End Date:</span>
        <span class="info-value">${endDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Participants:</span>
        <span class="info-value">${booking.participants} person(s)</span>
      </div>
    </div>
    
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">Contact Information</h3>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${booking.customer_email}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone:</span>
        <span class="info-value">${booking.customer_phone}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Emergency Contact:</span>
        <span class="info-value">${booking.emergency_contact}</span>
      </div>
    </div>
    
    ${booking.addons_summary ? `
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">Selected Add-ons</h3>
      <p>${booking.addons_summary}</p>
    </div>
    ` : ''}
    
    ${booking.special_requests ? `
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">Special Requests</h3>
      <p>${booking.special_requests}</p>
    </div>
    ` : ''}
    
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">Payment Summary</h3>
      <div class="info-row">
        <span class="info-label">Base Price:</span>
        <span class="info-value">₹${parseFloat(booking.base_price).toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Add-ons Total:</span>
        <span class="info-value">₹${parseFloat(booking.addons_total).toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Subtotal:</span>
        <span class="info-value">₹${parseFloat(booking.subtotal).toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tax (5%):</span>
        <span class="info-value">₹${parseFloat(booking.tax_amount).toFixed(2)}</span>
      </div>
    </div>
    
    <div class="total-amount">
      Total Amount: ₹${parseFloat(booking.total_amount).toFixed(2)}
    </div>
    
    <div class="important-note">
      <strong>⚠️ Important:</strong>
      <ul>
        <li>Payment must be completed by ${new Date(booking.payment_deadline).toLocaleDateString('en-IN')}</li>
        <li>Please carry a valid ID proof</li>
        <li>Arrive at the meeting point 30 minutes before departure</li>
        <li>Check weather conditions before the trek</li>
      </ul>
    </div>
    

    <p>If you have any questions or need to make changes to your booking, please contact us at:</p>
    <p>
      📧 Email: support@starthere.com<br>
      📱 Phone: +91 1234567890
    </p>
    
    <p>We look forward to having you on this amazing trek!</p>
    
    <p>Best regards,<br>
    <strong>Start Here Tours & Treks Team</strong></p>
  </div>
  
  <div class="footer">
    <p>This is an automated email. Please do not reply to this email.</p>
    <p>&copy; ${new Date().getFullYear()} Start Here Tours & Treks. All rights reserved.</p>
  </div>
</body>
</html>
    `;

    // Email options
    const mailOptions = {
      from: `"Start Here Tours & Treks" <${process.env.SMTP_USER}>`,
      to: booking.customer_email,
      subject: `Booking Confirmed - ${booking.trek_name} (${booking.booking_reference})`,
      html: emailHtml,
      text: `
Booking Confirmed!

Dear ${booking.customer_name},

Your trek booking has been successfully confirmed.

Booking Reference: ${booking.booking_reference}
Trek: ${booking.trek_name}
Start Date: ${startDate}
End Date: ${endDate}
Participants: ${booking.participants}
Total Amount: ₹${booking.total_amount}

Payment Deadline: ${new Date(booking.payment_deadline).toLocaleDateString('en-IN')}

Thank you for choosing Start Here Tours & Treks!

Best regards,
Start Here Tours & Treks Team
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}

/**
 * Send booking cancellation email
 * @param {Object} booking - Booking details
 */
async function sendCancellationEmail(booking) {
  try {
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #dc3545;
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border: 1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Booking Cancelled</h1>
  </div>
  <div class="content">
    <p>Dear ${booking.customer_name},</p>
    <p>Your booking for <strong>${booking.trek_name}</strong> (Reference: ${booking.booking_reference}) has been cancelled.</p>
    <p>If you have any questions, please contact our support team.</p>
    <p>Best regards,<br>Start Here Tours & Treks Team</p>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Start Here Tours & Treks" <${process.env.SMTP_USER}>`,
      to: booking.customer_email,
      subject: `Booking Cancelled - ${booking.booking_reference}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Cancellation email error:', error);
    throw error;
  }
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail
};