// File: backend/scripts/setupEmailTemplates.js
const fs = require('fs');
const path = require('path');

/**
 * This script creates the necessary directory structure for email templates
 * and ensures that package.json has the required dependencies
 */
function setupEmailTemplates() {
  console.log('Setting up email templates directory structure...');
  
  // Create templates directory if it doesn't exist
  const templatesDir = path.join(__dirname, '..', 'templates');
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir);
    console.log('Created templates directory');
  }
  
  // Create emails directory if it doesn't exist
  const emailsDir = path.join(templatesDir, 'emails');
  if (!fs.existsSync(emailsDir)) {
    fs.mkdirSync(emailsDir);
    console.log('Created templates/emails directory');
  }
  
  // Create a sample email template if none exist
  const sampleTemplate = path.join(emailsDir, 'sample.html');
  if (fs.readdirSync(emailsDir).length === 0) {
    const sampleContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sample Email Template</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { background-color: #f3f4f6; padding: 10px; text-align: center; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Sample Email Template</h1>
        </div>
        <div class="content">
            <p>Hello {{name}},</p>
            <p>This is a sample email template. You can use Handlebars syntax for dynamic content.</p>
            <p>For example: {{variable}}</p>
        </div>
        <div class="footer">
            <p>&copy; {{year}} Your Company. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(sampleTemplate, sampleContent);
    console.log('Created sample email template at templates/emails/sample.html');
  }
  
  // Check if required npm dependencies are installed
  let packageJsonPath = path.join(__dirname, '..', 'package.json');
  let packageJson;
  
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    console.error('Error reading package.json:', error);
    return;
  }
  
  const requiredDependencies = {
    'nodemailer': '^6.9.1',
    'handlebars': '^4.7.7'
  };
  
  let dependenciesMissing = false;
  
  for (const [dependency, version] of Object.entries(requiredDependencies)) {
    if (!packageJson.dependencies || !packageJson.dependencies[dependency]) {
      dependenciesMissing = true;
      console.log(`Missing required dependency: ${dependency}@${version}`);
    }
  }
  
  if (dependenciesMissing) {
    console.log('\nPlease install the missing dependencies using:');
    console.log('npm install --save nodemailer handlebars');
  } else {
    console.log('All required dependencies are installed');
  }
  
  // Update .env file with email configuration if not already present
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.error('Error reading .env file:', error);
    return;
  }
  
  // Check if EMAIL_ variables already exist
  if (!envContent.includes('EMAIL_HOST=')) {
    const emailConfig = `
    # Email Configuration
    EMAIL_HOST=smtp.gmail.com
    EMAIL_PORT=587
    EMAIL_SECURE=false
    EMAIL_USER=mramabhadrarao1@gmail.com
    EMAIL_PASSWORD=oued qpjw nexh oxvg
    EMAIL_FROM=mramabhadrarao1@gmail.com
    EMAIL_FROM_NAME=Mouli Multi Tenant App
    EMAIL_USER2=maddu.ramabhadrarao@gmail.com
`;
    
    fs.appendFileSync(envPath, emailConfig);
    console.log('Added email configuration to .env file');
    console.log('Please update the email settings in your .env file');
  }
  
  console.log('\nEmail templates setup completed successfully!');
}

// Run the setup function
setupEmailTemplates();