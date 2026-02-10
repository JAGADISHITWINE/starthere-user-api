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

    // Generate participants table HTML
    let participantsTableHtml = '';
    if (booking.participants_details && booking.participants_details.length > 0) {
      const participantRows = booking.participants_details.map((participant, index) => `
        <tr style="${index % 2 === 0 ? 'background-color: #f9f9f9;' : ''}">
          <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">
            ${participant.name}
            ${participant.is_primary_contact ? '<span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 5px;">PRIMARY</span>' : ''}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd;">${participant.age || '-'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${participant.gender || '-'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${participant.id_type || '-'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${participant.id_number || '-'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${participant.phone || '-'}</td>
        </tr>
      `).join('');

      participantsTableHtml = `
        <div class="info-section">
          <h3 style="margin-top: 0; color: #667eea;">👥 Participant Details</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background-color: #667eea; color: white;">
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">#</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Age</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Gender</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ID Type</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ID Number</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Phone</th>
              </tr>
            </thead>
            <tbody>
              ${participantRows}
            </tbody>
          </table>
          <p style="margin-top: 15px; font-size: 13px; color: #666;">
            <strong>Note:</strong> Please ensure all participants carry their ID proof mentioned above during the trek.
          </p>
        </div>
      `;
    }

    // Generate medical info summary if any participant has medical conditions
    let medicalInfoHtml = '';
    if (booking.participants_details && booking.participants_details.length > 0) {
      const participantsWithMedicalInfo = booking.participants_details.filter(
        p => p.medical_info && p.medical_info.trim() !== ''
      );

      if (participantsWithMedicalInfo.length > 0) {
        const medicalRows = participantsWithMedicalInfo.map(p => `
          <div style="padding: 10px; background: #fff; border-left: 3px solid #ff9800; margin-bottom: 10px;">
            <strong>${p.name}:</strong> ${p.medical_info}
          </div>
        `).join('');

        medicalInfoHtml = `
          <div class="info-section" style="background: #fff3e0; border-left: 4px solid #ff9800;">
            <h3 style="margin-top: 0; color: #ff9800;">🏥 Medical Information</h3>
            <p style="margin-bottom: 15px; color: #666;">Please note the following medical conditions/allergies:</p>
            ${medicalRows}
          </div>
        `;
      }
    }

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
      max-width: 800px;
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
    table {
      font-size: 14px;
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
      <h3 style="margin-top: 0; color: #667eea;">🏔️ Trek Details</h3>
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
    
    ${participantsTableHtml}
    
    ${medicalInfoHtml}
    
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">📞 Contact Information</h3>
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
      <h3 style="margin-top: 0; color: #667eea;">➕ Selected Add-ons</h3>
      <p>${booking.addons_summary}</p>
    </div>
    ` : ''}
    
    ${booking.special_requests ? `
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">📝 Special Requests</h3>
      <p>${booking.special_requests}</p>
    </div>
    ` : ''}
    
    <div class="info-section">
      <h3 style="margin-top: 0; color: #667eea;">💰 Payment Summary</h3>
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
        <li>Payment must be completed by <strong>${new Date(booking.payment_deadline).toLocaleDateString('en-IN')}</strong></li>
        <li><strong>All participants must carry their ID proof</strong> mentioned in the participant details</li>
        <li>Arrive at the meeting point 30 minutes before departure</li>
        <li>Check weather conditions before the trek</li>
        <li>Wear appropriate trekking shoes and comfortable clothing</li>
        <li>Carry sufficient water and energy snacks</li>
        ${booking.participants_details && booking.participants_details.some(p => p.medical_info) ?
        '<li><strong>Our trek leaders have been informed about medical conditions mentioned above</strong></li>' : ''}
      </ul>
    </div>
    
    <p>If you have any questions or need to make changes to your booking, please contact us at:</p>
    <p>
      📧 Email: support@starthere.com<br>
      📱 Phone: +91 1234567890<br>
      🕐 Support Hours: 9:00 AM - 6:00 PM (Mon-Sat)
    </p>
    
    <p>We look forward to having you on this amazing trek!</p>
    
    <p>Best regards,<br>
    <strong>Start Here Tours & Treks Team</strong></p>
  </div>
  
  <div class="footer">
    <p>This is an automated email. Please do not reply to this email.</p>
    <p>&copy; ${new Date().getFullYear()} Start Here Tours & Treks. All rights reserved.</p>
    <p style="font-size: 12px; color: #999; margin-top: 10px;">
      Booking Reference: ${booking.booking_reference} | 
      Trek ID: ${booking.trek_id} | 
      Batch ID: ${booking.batch_id}
    </p>
  </div>
</body>
</html>
    `;

    // Generate plain text version with participants
    let participantsText = '';
    if (booking.participants_details && booking.participants_details.length > 0) {
      participantsText = '\n\nParticipant Details:\n' +
        booking.participants_details.map((p, i) =>
          `${i + 1}. ${p.name}${p.is_primary_contact ? ' (Primary Contact)' : ''}\n` +
          `   Age: ${p.age || '-'}, Gender: ${p.gender || '-'}\n` +
          `   ID: ${p.id_type || '-'} - ${p.id_number || '-'}\n` +
          `   Phone: ${p.phone || '-'}\n` +
          (p.medical_info ? `   Medical Info: ${p.medical_info}\n` : '')
        ).join('\n');
    }

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
${participantsText}

Payment Summary:
- Base Price: ₹${booking.base_price}
- Add-ons: ₹${booking.addons_total}
- Subtotal: ₹${booking.subtotal}
- Tax (5%): ₹${booking.tax_amount}
- Total Amount: ₹${booking.total_amount}

Payment Deadline: ${new Date(booking.payment_deadline).toLocaleDateString('en-IN')}

IMPORTANT:
- All participants must carry their ID proof
- Arrive 30 minutes before departure
- Check weather conditions before the trek

Thank you for choosing Start Here Tours & Treks!

Best regards,
Start Here Tours & Treks Team

---
This is an automated email. For support, contact:
Email: support@starthere.com
Phone: +91 1234567890
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log(`✓ Confirmation email sent to ${booking.customer_email} (Message ID: ${info.messageId})`);

    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
}

async function sendCancellationEmail(booking) {
  try {
    const startDate = new Date(booking.start_date).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate participants list
    let participantsList = '';
    if (booking.participants_details && booking.participants_details.length > 0) {
      participantsList = booking.participants_details.map((p, i) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${p.name}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${p.age || '-'}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${p.gender || '-'}</td>
        </tr>
      `).join('');
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e74c3c; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; }
    .info-section { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #e74c3c; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #e74c3c; color: white; padding: 10px; text-align: left; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Booking Cancelled</h1>
  </div>
  
  <div class="content">
    <p>Dear ${booking.customer_name},</p>
    
    <p>Your booking has been cancelled as requested.</p>
    
    <div class="info-section">
      <h3>Cancelled Booking Details</h3>
      <p><strong>Booking Reference:</strong> ${booking.booking_reference}</p>
      <p><strong>Trek:</strong> ${booking.trek_name}</p>
      <p><strong>Date:</strong> ${startDate}</p>
      <p><strong>Participants:</strong> ${booking.participants}</p>
    </div>

    ${participantsList ? `
    <div class="info-section">
      <h3>Cancelled Participants</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Age</th>
            <th>Gender</th>
          </tr>
        </thead>
        <tbody>
          ${participantsList}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <div class="info-section">
      <h3>Refund Details</h3>
      <p><strong>Total Amount:</strong> ₹${booking.total_amount}</p>
      <p><strong>Cancellation Fee:</strong> ₹${booking.cancellation_fee}</p>
      <p><strong>Refund Amount:</strong> ₹${booking.refund_amount} (${booking.refund_percentage}%)</p>
      <p><strong>Processing Time:</strong> 7-10 business days</p>
    </div>

    <p>If you have any questions, please contact us.</p>
    
    <p>Best regards,<br><strong>Start Here Tours & Treks Team</strong></p>
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

    await transporter.sendMail(mailOptions);
    return { success: true };

  } catch (error) {
    console.error('Cancellation email error:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(
  toEmail,
  resetLink,
  userName
) {
  const mailOptions = {
    from: `"Your App Name" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject: 'Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: #007bff; padding: 32px; text-align: center; }
            .header h1 { color: #fff; margin: 0; font-size: 24px; }
            .body { padding: 32px; }
            .body p { color: #555; line-height: 1.6; }
            .btn { display: inline-block; padding: 14px 32px; background: #007bff; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 24px 0; }
            .warning { background: #fff8e1; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; color: #92400e; font-size: 13px; }
            .footer { text-align: center; padding: 16px; color: #aaa; font-size: 12px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset</h1>
            </div>
            <div class="body">
              <p>Hi <strong>${userName}</strong>,</p>
              <p>We received a request to reset the password for your account. Click the button below to set a new password:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="btn">Reset My Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #007bff;">${resetLink}</p>
              <div class="warning">
                ⚠️ This link will expire in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email or contact support if you have concerns.
              </div>
            </div>
            <div class="footer">
              © ${new Date().getFullYear()} Your App Name. All rights reserved.
            </div>
          </div>
        </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

async function sendOtpEmail(toEmail, otp, userName) {
  const mailOptions = {
    from: `"Your App Name" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject: 'Your Email Verification OTP',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: #667eea; padding: 32px; text-align: center; }
            .header h1 { color: #fff; margin: 0; font-size: 24px; }
            .body { padding: 32px; text-align: center; }
            .otp-box { display: inline-block; background: #f7f7ff; border: 2px dashed #667eea; border-radius: 12px; padding: 20px 40px; margin: 24px 0; }
            .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #667eea; font-family: monospace; }
            .warning { background: #fff8e1; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; color: #92400e; font-size: 13px; text-align: left; margin-top: 16px; }
            .footer { text-align: center; padding: 16px; color: #aaa; font-size: 12px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>Email Verification</h1></div>
            <div class="body">
              <p>Hi <strong>${userName}</strong>, use the OTP below to verify your email:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p style="color:#718096; font-size:14px;">This OTP expires in <strong>10 minutes</strong>.</p>
              <div class="warning">⚠️ Do not share this OTP with anyone. If you did not request this, please ignore this email.</div>
            </div>
            <div class="footer">© ${new Date().getFullYear()} Your App Name. All rights reserved.</div>
          </div>
        </body>
      </html>
    `
  };
  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPasswordResetEmail,
  sendOtpEmail
};