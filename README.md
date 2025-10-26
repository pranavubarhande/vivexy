# 🚀 SaaS Template - Next.js + Prisma + Tailwind + shadcn/ui

A modern, full-stack SaaS (Software as a Service) template built with Next.js 16, Prisma, PostgreSQL, Tailwind CSS, and shadcn/ui components. This template includes authentication, team management, subscription billing with Stripe, and a beautiful, responsive dashboard.

![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black) ![Prisma](https://img.shields.io/badge/Prisma-6.18.0-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-4.0-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![Stripe](https://img.shields.io/badge/Stripe-19.1.0-purple)

## ✨ Features

### 🔐 Authentication & Authorization

- **JWT-based authentication** with secure token management
- **Role-based access control** (User, Admin, Super Admin)
- **Password hashing** with bcrypt
- **Session management** with NextAuth.js

### 👥 Team Management

- **Multi-team support** with role-based permissions (Owner, Admin, Member)
- **Team invitations** via email with token-based verification
- **Member management** with role assignment
- **Team creation and deletion** with proper access controls

### 💳 Subscription & Billing

- **Stripe integration** for payment processing
- **Multiple subscription plans** (Free, Pro, Enterprise)
- **Invoice management** with PDF generation
- **Webhook handling** for payment events
- **Subscription lifecycle management**

### 🎨 Modern UI/UX

- **shadcn/ui components** for consistent design
- **Tailwind CSS** for styling with custom theme
- **Dark/Light mode** support with next-themes
- **Responsive design** for all screen sizes
- **Beautiful dashboard** with charts and analytics

### 🛠️ Developer Experience

- **TypeScript** for type safety
- **ESLint & Prettier** for code quality
- **React Query** for data fetching and caching
- **React Hook Form** with Zod validation
- **Hot reload** in development

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.0 or later
- **npm** or **yarn** or **pnpm** or **bun**
- **PostgreSQL** 12.0 or later
- **Git** for version control

## 🚀 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/saas-template-nextjs-prisma-tailwind-shadcn.git
   cd saas-template-nextjs-prisma-tailwind-shadcn
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

3. **Set up environment variables**

   Copy the example environment file and configure it:

   ```bash
   cp .env.example .env
   ```

   Update the `.env` file with your configuration:

   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/saas_template?schema=public"

   # Next.js
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-nextauth-secret-key"

   # JWT Authentication
   JWT_SECRET="your-super-secret-jwt-key-change-in-production"
   JWT_EXPIRES_IN="7d"

   # Stripe Configuration
   STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key"
   STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"

   # Email Configuration (optional)
   SMTP_HOST=""
   SMTP_PORT=""
   SMTP_USER=""
   SMTP_PASS=""

   # Development
   NODE_ENV="development"
   ```

4. **Set up the database**

   Make sure PostgreSQL is running, then run:

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   This will create the database tables based on your Prisma schema.

5. **Seed the database (optional)**

   If you want sample data, you can create a seed script in `prisma/seed.ts` and run:

   ```bash
   npx prisma db seed
   ```

## 🏃‍♂️ Development

1. **Start the development server**

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

2. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

3. **Additional development commands**

   ```bash
   # Build for production
   npm run build

   # Start production server
   npm run start

   # Lint code
   npm run lint

   # Format code
   npm run format

   # Check formatting
   npm run format:check
   ```

## 📁 Project Structure

```markdown
├── app/ # Next.js App Router
│ ├── (auth)/ # Authentication pages
│ ├── (dashboard)/ # Protected dashboard pages
│ ├── api/ # API routes
│ └── globals.css # Global styles
├── components/ # React components
│ ├── ui/ # shadcn/ui components
│ ├── auth/ # Authentication components
│ ├── dashboard/ # Dashboard components
│ └── shared/ # Shared components
├── hooks/ # Custom React hooks
├── lib/ # Utility libraries
│ ├── middleware.ts # Next.js middleware
│ ├── prisma.ts # Prisma client
│ └── utils.ts # Helper functions
├── services/ # API service functions
├── types/ # TypeScript type definitions
└── prisma/ # Database schema and migrations
└── schema.prisma # Prisma schema
```

## 🔧 Configuration

### Database Configuration

The project uses Prisma with PostgreSQL. Update the `DATABASE_URL` in your `.env` file to match your database setup.

### Authentication Configuration

- **JWT_SECRET**: Generate a secure random string for JWT signing
- **NEXTAUTH_SECRET**: Generate a secure random string for NextAuth

### Stripe Configuration

Follow these steps to enable pricing and billing with Stripe. You can use either Payment Links or Price IDs. If a plan has a Payment Link configured, the app opens it directly; otherwise it falls back to creating a Checkout Session with the Price ID.

1. Create a [Stripe account](https://stripe.com) and switch to Test Mode.
2. In Stripe Dashboard, get your API keys and set envs:

   ```env
   STRIPE_SECRET_KEY="sk_test_..."
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."  # filled after step 6

   # Optional: plan display prices shown in UI
   NEXT_PUBLIC_PRO_PRICE_USD="29"
   NEXT_PUBLIC_ENTERPRISE_PRICE_USD="99"

   # EITHER: use Payment Links (copy from Stripe Dashboard)
   NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO="https://buy.stripe.com/test_..."
   NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ENTERPRISE="https://buy.stripe.com/test_..."

   # OR: use recurring Price IDs (Products → Prices)
   NEXT_PUBLIC_STRIPE_PRICE_ID_PRO="price_..."
   NEXT_PUBLIC_STRIPE_PRICE_ID_ENTERPRISE="price_..."
   ```

3. If using Price IDs, ensure each Product Price is set to "recurring" (monthly) to create subscriptions.
4. Ensure `NEXT_PUBLIC_APP_URL` is set (e.g., `http://localhost:3000`).
5. Start the app and open the Billing page. Choosing a plan will either open a Payment Link or create a Checkout Session.
6. Set up webhooks (required for invoices and subscription updates):

   ```bash
   # Install Stripe CLI and run:
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the `Signing secret` from the CLI output and set it as `STRIPE_WEBHOOK_SECRET` in `.env`.

7. Test the flow using Stripe test cards (e.g., `4242 4242 4242 4242`).

#### How the app uses your Stripe config

- UI plan config: `config/billing.ts` reads the envs above to display plans and determine Payment Link vs Checkout.
- Checkout (Price IDs): `POST /api/stripe/checkout` creates a Checkout Session and redirects to Stripe.
- Webhooks: `POST /api/stripe/webhook` verifies signature, logs the full event, and updates `subscriptions` and `invoices`.
- Logs: Stripe events are persisted to the database table `stripe_event_logs`.

If an invoice cannot be mapped to a user by email, you can optionally set `STRIPE_FALLBACK_USER_ID` in `.env` to attribute records.

### Email Configuration (Optional)

Configure SMTP settings in `.env` if you want to send invitation emails and hook it to auth flow. Currently its not being used:

- **SMTP_HOST**: Your SMTP server hostname
- **SMTP_PORT**: SMTP server port (usually 587)
- **SMTP_USER**: SMTP username
- **SMTP_PASS**: SMTP password

## 🌟 Key Features Explained

### Authentication Flow

1. Users register/login through the auth pages
2. JWT tokens are generated and stored in cookies
3. Protected routes check for valid authentication
4. Role-based permissions control access to features

### Team Management

1. Users can create and own multiple teams
2. Team owners can invite members via email
3. Role-based permissions (Owner, Admin, Member)
4. Members can be assigned different roles with appropriate permissions

### Subscription Management

1. Multiple subscription plans with different features
2. Stripe integration for secure payment processing
3. Invoice generation and management
4. Webhook handling for subscription events

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy automatically on every push

### Other Platforms

This project can be deployed on any platform that supports Node.js:

- **Railway**
- **Render**
- **DigitalOcean App Platform**
- **AWS**
- **Google Cloud**

### Environment Variables for Production

Make sure to update these environment variables for production:

- Set `NODE_ENV=production`
- Use production database URL
- Use production Stripe keys
- Generate new JWT and NextAuth secrets
- Set proper `NEXT_PUBLIC_APP_URL`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and conventions
- Write tests for new features
- Update documentation as needed
- Use conventional commits

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you need help or have questions:

1. Check the [Issues](https://github.com/pranavubarhande/saas-template-nextjs-prisma-tailwind-shadcn/issues) page
2. Create a new issue with detailed information
3. Join our Discord community (if available)

---

**Happy coding!** 🎉
