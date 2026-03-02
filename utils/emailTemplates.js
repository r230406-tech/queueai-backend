/**
 * HTML email templates for QueueAI notification system.
 */

/**
 * "You're almost up!" – sent when peopleAhead <= 2
 */
const buildNearlyReadyEmail = ({ name, token, position, shopName, estimatedWait, queueUrl }) => {
    const positionText = position === 1
        ? `🎉 You're <strong>next in line</strong>!`
        : `You're <strong>#${position}</strong> in the queue — almost there!`;

    const waitText = position === 1
        ? `Please make your way to the counter now.`
        : `Estimated wait: <strong>~${estimatedWait} minute${estimatedWait !== 1 ? 's' : ''}</strong>.`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Your Turn Is Near – QueueAI</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body  { background: #0f0f1a; font-family: 'Inter', Arial, sans-serif; color: #e2e8f0; }
    .wrap { max-width: 540px; margin: 32px auto; padding: 0 16px; }
    .card { background: #16162a; border-radius: 18px; overflow: hidden;
            box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
    .header { background: linear-gradient(135deg,#6366f1,#4f46e5);
              padding: 40px 36px 36px; text-align: center; }
    .header h1 { font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .header p  { font-size: 14px; color: rgba(255,255,255,0.75); }
    .body { padding: 36px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .msg { font-size: 15px; color: #94a3b8; line-height: 1.7; margin-bottom: 28px; }
    .msg strong { color: #e2e8f0; }
    .token-box { background: #1e1e35; border: 2px solid #6366f1;
                 border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 28px; }
    .token-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
                   color: #64748b; margin-bottom: 6px; }
    .token-num   { font-size: 36px; font-weight: 900; letter-spacing: 4px;
                   background: linear-gradient(135deg,#6366f1,#a78bfa);
                   -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .position-badge { display: inline-block; background: rgba(245,158,11,0.15);
                      color: #f59e0b; border-radius: 999px; padding: 6px 16px;
                      font-size: 13px; font-weight: 700; margin: 12px 0; }
    .cta { display: block; background: linear-gradient(135deg,#6366f1,#4f46e5);
           color: #fff !important; text-decoration: none; border-radius: 10px;
           padding: 14px 24px; font-size: 15px; font-weight: 700;
           text-align: center; margin-bottom: 28px;
           box-shadow: 0 4px 20px rgba(99,102,241,0.4); }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 0 0 24px; }
    .footer  { font-size: 12px; color: #475569; text-align: center; line-height: 1.8; }
    .footer a { color: #6366f1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">

      <!-- Header -->
      <div class="header">
        <h1>🎯 QueueAI</h1>
        <p>Smart Virtual Queue Management</p>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Hi ${escapeHtml(name)},</p>

        <p class="msg">
          ${positionText}<br/>
          ${waitText}
          ${shopName ? `<br/>📍 Shop: <strong>${escapeHtml(shopName)}</strong>` : ''}
        </p>

        <!-- Token box -->
        <div class="token-box">
          <div class="token-label">Your Token</div>
          <div class="token-num">${escapeHtml(token)}</div>
          <div class="position-badge">
            Position #${position}
          </div>
        </div>

        ${queueUrl ? `<a class="cta" href="${queueUrl}">View Live Status →</a>` : ''}

        <hr class="divider"/>

        <p class="msg" style="font-size:13px;color:#475569;">
          Please keep this email handy. If you miss your turn, visit the queue counter or rejoin online.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer" style="padding:20px 0;">
      <p>Powered by <a href="#">QueueAI</a> · No-reply notification</p>
      <p style="margin-top:4px;">If you did not request this, please ignore.</p>
    </div>
  </div>
</body>
</html>`;
};

/**
 * "You are now being served" – sent when status changes to 'serving'
 */
const buildServingEmail = ({ name, token, counterNumber, shopName }) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:#0f0f1a; font-family:Arial,sans-serif; color:#e2e8f0; }
    .wrap { max-width:520px; margin:32px auto; padding:0 16px; }
    .card { background:#16162a; border-radius:18px; overflow:hidden; box-shadow:0 8px 40px rgba(0,0,0,0.6); }
    .header { background:linear-gradient(135deg,#10b981,#059669); padding:36px; text-align:center; }
    .header h1 { font-size:26px; font-weight:800; color:#fff; }
    .body { padding:36px; }
    .token-box { background:#1e1e35; border:2px solid #10b981; border-radius:14px; padding:24px; text-align:center; margin:20px 0; }
    .token-num { font-size:32px; font-weight:900; letter-spacing:4px; color:#10b981; }
    .counter   { font-size:22px; font-weight:700; color:#f59e0b; margin-top:8px; }
    .footer    { font-size:12px; color:#475569; text-align:center; padding:20px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header"><h1>🔔 It's Your Turn!</h1></div>
      <div class="body">
        <p style="font-size:17px;font-weight:600;margin-bottom:12px;">Hi ${escapeHtml(name)},</p>
        <p style="color:#94a3b8;line-height:1.7;margin-bottom:20px;">
          Your number has been called${shopName ? ` at <strong style="color:#e2e8f0;">${escapeHtml(shopName)}</strong>` : ''}.
          Please proceed immediately.
        </p>
        <div class="token-box">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Token</div>
          <div class="token-num">${escapeHtml(token)}</div>
          ${counterNumber ? `<div class="counter">Counter ${escapeHtml(String(counterNumber))}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="footer">Powered by QueueAI</div>
  </div>
</body>
</html>`;
};

/** Basic HTML entity escaping */
const escapeHtml = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

module.exports = { buildNearlyReadyEmail, buildServingEmail };
