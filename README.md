# SetuAI - Intelligent Compliance Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)

SetuAI is a comprehensive compliance management platform that leverages AI to streamline regulatory compliance for manufacturing and textile industries. The platform provides intelligent document verification, compliance scoring, vendor management, and automated reporting capabilities.

## 🌟 Features

### 🔐 Authentication & User Management
- **Multi-role System**: Vendor Admin, Buyer Admin, System Admin
- **Secure Registration**: Vendor registration with company details
- **JWT Authentication**: Secure token-based authentication
- **Password Security**: Bcrypt hashing with configurable salt rounds

### 🌍 Multi-Language Support
- **Complete Localization**: English, Hindi, and Tamil
- **Dynamic Language Switching**: Real-time language changes
- **Comprehensive Translations**: All UI elements and messages localized

### 📊 Dashboard & Analytics
- **Real-time Compliance Scoring**: AI-powered compliance assessment
- **Document Management**: Upload, verify, and track compliance documents
- **Interactive Charts**: Visual representation of compliance metrics
- **Activity Tracking**: Recent activities and audit trails

### 🏭 Vendor Management
- **Vendor Profiles**: Comprehensive vendor information management
- **Compliance Status Tracking**: Real-time compliance monitoring
- **Document Verification**: AI-powered document analysis
- **Marketplace Integration**: Vendor discovery and engagement

### 💼 Buyer Engagement
- **Request Management**: Create and manage vendor engagement requests
- **Priority System**: Urgent, High, Medium, Low priority levels
- **Status Tracking**: Active, Pending, On Hold, Completed states
- **Invoice Management**: Upload and track invoices

### 📈 Reports & Insights
- **Compliance Breakdown**: Pillar-wise compliance analysis
- **Smart Recommendations**: AI-powered actionable insights
- **Export Capabilities**: Generate and export compliance reports
- **Historical Data**: Track compliance trends over time

### 💰 Wage Verification
- **File Upload**: Support for CSV and Excel files
- **AI Analysis**: Automated wage data verification
- **Discrepancy Detection**: Identify compliance issues
- **Risk Scoring**: Calculate compliance risk levels

### 🔔 Notification System
- **Real-time Notifications**: Instant updates on important events
- **Smart Filtering**: Priority-based notification management
- **Mark as Read**: Individual and bulk notification management
- **Persistent State**: Notification state management across sessions

### 🎨 Modern UI/UX
- **Dark/Light Mode**: Toggle between themes
- **Responsive Design**: Mobile-first responsive layout
- **Smooth Animations**: Framer Motion powered transitions
- **Accessibility**: WCAG compliant design

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 13+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/aksidharth04/SetuAI.git
   cd SetuAI
   ```

2. **Set up the backend**
   ```bash
   cd setuai/setuai-backend
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/setuai"
   JWT_SECRET="your-super-secret-jwt-key"
   SALT_ROUNDS=10
   PORT=3001
   GEMINI_API_KEY="your-gemini-api-key"
   ```

4. **Set up the database**
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```

5. **Start the backend server**
   ```bash
   npm start
   ```

6. **Set up the frontend**
   ```bash
   cd ../setuai-frontend
   npm install
   ```

7. **Configure frontend environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   VITE_API_BASE_URL=http://localhost:3001
   ```

8. **Start the frontend development server**
   ```bash
   npm run dev
   ```

9. **Access the application**
   - Frontend: http://localhost:5173 (or 5174 if 5173 is busy)
   - Backend API: http://localhost:3001
   - Health Check: http://localhost:3001/health

## 📁 Project Structure

```
SetuAI/
├── setuai/
│   ├── setuai-backend/          # Node.js/Express backend
│   │   ├── src/
│   │   │   ├── api/            # API routes and controllers
│   │   │   ├── config/         # Configuration files
│   │   │   ├── middleware/     # Custom middleware
│   │   │   ├── services/       # Business logic services
│   │   │   └── server.js       # Main server file
│   │   ├── prisma/             # Database schema and migrations
│   │   └── uploads/            # File upload directory
│   └── setuai-frontend/        # React frontend
│       ├── src/
│       │   ├── components/     # Reusable UI components
│       │   ├── contexts/       # React contexts
│       │   ├── locales/        # Localization files
│       │   ├── pages/          # Page components
│       │   └── services/       # API services
│       └── public/             # Static assets
└── README.md                   # This file
```

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Primary database
- **Prisma** - Database ORM
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Multer** - File upload handling

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling framework
- **Framer Motion** - Animation library
- **React Router** - Client-side routing
- **Axios** - HTTP client

### AI & ML
- **Google Gemini API** - AI-powered document analysis
- **OCR Services** - Document text extraction
- **Compliance Scoring** - Automated compliance assessment

## 🔧 Configuration

### Environment Variables

#### Backend (.env)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/setuai"
JWT_SECRET="your-super-secret-jwt-key"
SALT_ROUNDS=10
PORT=3001
GEMINI_API_KEY="your-gemini-api-key"
```

#### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:3001
```

### Database Schema

The application uses Prisma with the following main models:
- **User** - Authentication and user management
- **Vendor** - Vendor profiles and information
- **BuyerEngagement** - Vendor-buyer relationships
- **Document** - Compliance documents
- **Invoice** - Financial records
- **WageVerification** - Wage compliance data

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Vendors
- `GET /api/vendor/profile` - Get vendor profile
- `PUT /api/vendor/profile` - Update vendor profile
- `GET /api/vendor/buyer-requests` - Get buyer requests

### Documents
- `POST /api/documents/upload` - Upload compliance documents
- `GET /api/documents` - Get user documents
- `DELETE /api/documents/:id` - Delete document

### Engagements
- `POST /api/engagement` - Create engagement
- `GET /api/engagement` - Get engagements
- `PUT /api/engagement/:id` - Update engagement

## 🎯 Key Features in Detail

### AI-Powered Compliance Analysis
- **Document Verification**: Automated analysis of compliance documents
- **Risk Assessment**: AI-driven risk scoring and recommendations
- **Pattern Recognition**: Identify compliance patterns and anomalies
- **Smart Insights**: Actionable recommendations for compliance improvement

### Multi-Language Support
- **Complete Localization**: All text elements translated
- **Dynamic Switching**: Real-time language changes without page reload
- **Cultural Adaptation**: Region-specific formatting and conventions
- **Accessibility**: Screen reader support for all languages

### Real-time Notifications
- **Smart Filtering**: Priority-based notification management
- **Persistent State**: Notification state preserved across sessions
- **Bulk Operations**: Mark all as read functionality
- **Real-time Updates**: Live notification updates

## 🚀 Deployment

### Production Build

1. **Build the frontend**
   ```bash
   cd setuai/setuai-frontend
   npm run build
   ```

2. **Set up production environment**
   ```bash
   cd ../setuai-backend
   NODE_ENV=production npm start
   ```

### Docker Deployment (Optional)

```dockerfile
# Backend Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Aksidharth M**
- GitHub: [@aksidharth04](https://github.com/aksidharth04)
- LinkedIn: [Aksidharth M](https://www.linkedin.com/in/adicherikandi-sidharth/)
- Twitter: [@aks2082](https://x.com/aks2082?s=11)

## 🙏 Acknowledgments

- **Google Gemini API** for AI-powered document analysis
- **Prisma** for excellent database management
- **Tailwind CSS** for the beautiful UI framework
- **Framer Motion** for smooth animations
- **React Community** for the amazing ecosystem

## 📞 Support

For support and questions:
- Email: your-booking-email@example.com
- Create an issue on GitHub
- Check the documentation in the `/docs` folder

---

**SetuAI** - Making regulatory compliance effortless and accurate with AI-powered intelligence. 🚀
