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

async function sendCancellationEmail(booking) {
  try {
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
    };

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

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
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      background: white;
      margin: 20px auto;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #dc3545;
      padding: 20px;
      margin: 20px 0;
      border-radius: 5px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #333;
      text-align: right;
    }
    .refund-section {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .refund-amount {
      font-size: 32px;
      color: #28a745;
      font-weight: bold;
      margin: 10px 0;
    }
    .refund-percentage {
      color: #155724;
      font-size: 16px;
      margin-bottom: 10px;
    }
    .refund-note {
      color: #155724;
      font-size: 14px;
      margin-top: 15px;
    }
    .cancellation-fee {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      text-align: center;
    }
    .cancellation-fee strong {
      color: #856404;
      font-size: 18px;
    }
    .timeline {
      margin: 20px 0;
      padding: 15px;
      background: #e7f3ff;
      border-radius: 8px;
    }
    .timeline-item {
      display: flex;
      align-items: center;
      margin: 10px 0;
    }
    .timeline-icon {
      width: 30px;
      height: 30px;
      background: #007bff;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 15px;
      font-size: 14px;
    }
    .policy {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .policy h3 {
      margin-top: 0;
      color: #495057;
      font-size: 16px;
    }
    .policy ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .policy li {
      margin: 8px 0;
      color: #666;
    }
    .footer {
      background: #2c3e50;
      color: white;
      padding: 30px;
      text-align: center;
    }
    .footer p {
      margin: 5px 0;
      font-size: 14px;
    }
    .footer a {
      color: #3498db;
      text-decoration: none;
    }
    .support-box {
      background: #fff;
      color: #333;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .support-box h3 {
      margin-top: 0;
      color: #dc3545;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 20px;
      }
      .refund-amount {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚫 Booking Cancelled</h1>
      <p>Cancellation Confirmation</p>
    </div>
    
    <div class="content">
      <p>Dear <strong>${booking.customer_name}</strong>,</p>
      
      <p>Your booking for <strong>${booking.trek_name}</strong> has been successfully cancelled as per your request.</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #495057;">Booking Details</h3>
        <div class="info-row">
          <span class="info-label">Booking Reference:</span>
          <span class="info-value"><strong>${booking.booking_reference}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Trek Name:</span>
          <span class="info-value">${booking.trek_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Trek Date:</span>
          <span class="info-value">${formatDate(booking.start_date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Participants:</span>
          <span class="info-value">${booking.participants}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cancellation Date:</span>
          <span class="info-value">${formatDate(new Date())}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cancellation Reason:</span>
          <span class="info-value">${booking.cancellation_reason}</span>
        </div>
      </div>

      <div class="refund-section">
        <p style="margin-top: 0; font-size: 16px; color: #155724;">
          <strong>💰 Refund Amount</strong>
        </p>
        <div class="refund-amount">${formatCurrency(booking.refund_amount)}</div>
        <div class="refund-percentage">(${booking.refund_percentage}% of total amount)</div>
        <div class="refund-note">
          <strong>Processing Time:</strong> 7-10 business days<br>
          <strong>Refund Method:</strong> ${booking.payment_method || 'Original payment method'}
        </div>
      </div>

      ${booking.cancellation_fee > 0 ? `
      <div class="cancellation-fee">
        <p style="margin: 0;">
          <strong>Cancellation Fee: ${formatCurrency(booking.cancellation_fee)}</strong>
        </p>
      </div>
      ` : ''}

      <div class="info-box">
        <h3 style="margin-top: 0; color: #495057;">Payment Summary</h3>
        <div class="info-row">
          <span class="info-label">Original Amount:</span>
          <span class="info-value">${formatCurrency(booking.total_amount)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cancellation Fee:</span>
          <span class="info-value">${formatCurrency(booking.cancellation_fee)}</span>
        </div>
        <div class="info-row" style="border-top: 2px solid #28a745; padding-top: 15px;">
          <span class="info-label"><strong>Refund Amount:</strong></span>
          <span class="info-value"><strong style="color: #28a745;">${formatCurrency(booking.refund_amount)}</strong></span>
        </div>
      </div>

      <div class="timeline">
        <h3 style="margin-top: 0; color: #495057;">What happens next?</h3>
        <div class="timeline-item">
          <div class="timeline-icon">✓</div>
          <div>Your booking has been cancelled</div>
        </div>
        <div class="timeline-item">
          <div class="timeline-icon">2</div>
          <div>Refund will be initiated within 24-48 hours</div>
        </div>
        <div class="timeline-item">
          <div class="timeline-icon">3</div>
          <div>Amount will be credited within 7-10 business days</div>
        </div>
        <div class="timeline-item">
          <div class="timeline-icon">📧</div>
          <div>You'll receive a confirmation once refund is processed</div>
        </div>
      </div>

      <div class="policy">
        <h3>Cancellation Policy Applied</h3>
        <ul>
          <li>30+ days before trek: 100% refund</li>
          <li>15-29 days before trek: 75% refund</li>
          <li>7-14 days before trek: 50% refund</li>
          <li>Less than 7 days: No refund</li>
        </ul>
        <p style="margin-bottom: 0; color: #666; font-size: 14px;">
          <strong>Note:</strong> Your cancellation was processed ${booking.days_until_trek} days before the trek.
        </p>
      </div>

      <div class="support-box">
        <h3>Need Help?</h3>
        <p>If you have any questions about your refund or cancellation, our support team is here to help.</p>
        <p>
          📧 Email: support@starthere.com<br>
          📞 Phone: +91 1234567890<br>
          🕐 Mon-Sat: 9:00 AM - 6:00 PM IST
        </p>
      </div>

      <p>We're sorry to see you cancel, but we hope to serve you again in the future!</p>
      
      <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>Start Here Tours & Treks Team</strong>
      </p>
    </div>

    <div class="footer">
      <p><strong>Start Here Tours & Treks</strong></p>
      <p>Adventure Awaits | Explore the Unexplored</p>
      <p>
        <a href="mailto:info@starthere.com">info@starthere.com</a> | 
        <a href="https://starthere.com">www.starthere.com</a>
      </p>
      <p style="font-size: 12px; opacity: 0.8; margin-top: 20px;">
        This is an automated email. Please do not reply to this message.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Start Here Tours & Treks" <${process.env.SMTP_USER}>`,
      to: booking.customer_email,
      subject: `Booking Cancelled - ${booking.booking_reference} | Refund: ${formatCurrency(booking.refund_amount)}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Cancellation email sent:', info.messageId);
    
    return { 
      success: true, 
      messageId: info.messageId,
      recipient: booking.customer_email
    };

  } catch (error) {
    console.error('Cancellation email error:', error);
    throw error;
  }
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail
};