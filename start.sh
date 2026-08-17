#!/bin/bash

echo "🐔 Starting Poultry Business Management System..."
echo ""

# Kill any existing processes
pkill -f "nest start" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Start Backend
echo "🚀 Starting Backend (NestJS) on port 3010..."
cd "$(dirname "$0")/server"
nohup npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

sleep 3

# Start Frontend
echo "🌐 Starting Frontend (Next.js) on port 3000..."
cd "$(dirname "$0")/client"
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "✅ Both servers started!"
echo ""
echo "   🌐 Frontend → http://localhost:3000"
echo "   ⚙️  Backend  → http://localhost:3010"
echo ""
echo "📋 View logs:"
echo "   Backend logs:  tail -f ~/Poultry-Business-Management-System/backend.log"
echo "   Frontend logs: tail -f ~/Poultry-Business-Management-System/frontend.log"
echo ""
echo "🛑 To stop servers:"
echo "   pkill -f 'nest start' && pkill -f 'next dev'"
