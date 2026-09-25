/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { 
  Home,
  MessageSquare, 
  Mic, 
  BarChart2, 
  BookOpen, 
  Bell,
  Sparkles,
  User as UserIcon,
  Brain
} from 'lucide-react';
import { TabType } from '../types';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  materialsCount: number;
}

export default function Header({ activeTab, onTabChange, materialsCount }: HeaderProps) {
  
  // The primary areas including Revision
  const navItems = [
    { id: 'home' as TabType, label: 'Home', icon: Home },
    { id: 'ask' as TabType, label: 'Ask', icon: MessageSquare },
    { id: 'viva' as TabType, label: 'Viva', icon: Mic },
    { id: 'revision' as TabType, label: 'Revision', icon: Brain },
    { id: 'progress' as TabType, label: 'Progress', icon: BarChart2 },
    { id: 'notes' as TabType, label: 'Notes', icon: BookOpen },
  ];

  return (
    <>
      {/* COMPACT APP TOP HEADER */}
      <header id="app-header" className="w-full bg-white/95 backdrop-blur-md border-b border-sky-100/80 sticky top-0 z-40 px-4 py-3 flex items-center justify-between shadow-[0_2px_12px_rgba(14,165,233,0.02)]">
        
        {/* Branding */}
        <button 
          onClick={() => onTabChange('home')}
          className="flex items-center gap-1.5 cursor-pointer text-left focus:outline-none group"
        >
          <motion.div
            initial={{ rotateX: -12, rotateY: 8, scale: 0.9, opacity: 0 }}
            animate={{ rotateX: 0, rotateY: 0, scale: 1, opacity: 1 }}
            whileHover={{ rotateX: -8, rotateY: 8, scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 280, damping: 16 }}
            style={{ transformPerspective: 700 }}
            className="relative h-9 w-9 bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 text-white rounded-xl flex items-center justify-center shadow-[0_7px_18px_rgba(14,165,233,0.30)] border border-sky-300/70 overflow-hidden"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-3 rounded-full border border-cyan-200/20"
            />
            <motion.div
              animate={{ x: [0, 2, 0], y: [0, -1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-cyan-200/30 blur-md"
            />
            <Sparkles className="relative h-4 w-4 drop-shadow-[0_3px_3px_rgba(255,255,255,0.35)]" />
          </motion.div>
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.35 }}
              className="flex items-center gap-1"
            >
              <span className="text-[15px] font-extrabold tracking-[0.18em] bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 bg-clip-text text-transparent drop-shadow-[0_2px_2px_rgba(14,165,233,0.20)]">
                KNOWVA
              </span>
              <motion.span
                animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.75)]"
              />
            </motion.div>
            <motion.span
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.4 }}
              className="text-[8px] text-sky-600 font-extrabold tracking-[0.14em] block leading-none uppercase drop-shadow-[0_1px_2px_rgba(14,165,233,0.14)]"
            >
              SMARTER STUDY, SIMPLIFIED
            </motion.span>
          </div>
        </button>

        {/* Action icons / Doc count */}
        <div className="flex items-center gap-2">
          {/* Document count pill */}
          {materialsCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2 py-1 bg-sky-50 border border-sky-100 rounded-full flex items-center gap-1 text-[10px] font-bold text-sky-700 shadow-sm"
            >
              <BookOpen className="h-3 w-3 text-sky-500" />
              <span>{materialsCount}</span>
            </motion.div>
          )}

          {/* Quick Notification Bell */}
          <button 
            onClick={() => onTabChange('settings')}
            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50/50 rounded-lg transition-colors cursor-pointer"
            title="Notification Hub"
          >
            <Bell className="h-4 w-4" />
          </button>



          {/* Avatar Profile Trigger */}
          <button
            id="profile-avatar-button"
            onClick={() => onTabChange('profile')}
            className={`h-7 w-7 rounded-full bg-slate-100 border flex items-center justify-center transition-all cursor-pointer focus:outline-none overflow-hidden ${
              activeTab === 'profile' || activeTab === 'settings'
                ? 'border-sky-500 ring-2 ring-sky-500/10 text-sky-600' 
                : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
            }`}
            title="My Profile"
          >
            <UserIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* MOBILE FIXED BOTTOM NAVIGATION BAR */}
      <nav id="mobile-bottom-nav" className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-8px_30px_rgba(14,165,233,0.06)] px-2 z-40">
        <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;

            return (
              <motion.button
                key={item.id}
                id={`mobile-nav-tab-${item.id}`}
                onClick={() => onTabChange(item.id)}
                whileHover={{ y: -2, scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
                className="relative flex flex-col items-center justify-center w-14 h-12 gap-0.5 text-center cursor-pointer focus:outline-none"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicatorMobile"
                    initial={{ opacity: 0, scale: 0.82, rotateX: -8 }}
                    animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                    className="absolute w-12 h-11 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-cyan-500 border border-sky-300/80 shadow-[0_7px_18px_rgba(14,165,233,0.28)] -z-10"
                    style={{ transformPerspective: 700 }}
                  >
                    <motion.div
                      animate={{ x: [0, 2, 0], y: [0, -1, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute -right-2 -top-2 h-8 w-8 rounded-full bg-cyan-200/25 blur-lg pointer-events-none"
                    />
                  </motion.div>
                )}
                <motion.div
                  animate={isActive ? { y: [0, -1.5, 0], rotateX: [0, -4, 0] } : { y: 0, rotateX: 0 }}
                  transition={isActive ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                  style={{ transformPerspective: 700 }}
                  className={`relative z-10 transition-colors duration-200 ${
                    isActive ? 'text-white drop-shadow-[0_2px_3px_rgba(255,255,255,0.30)]' : 'text-slate-400 group-hover:text-sky-500'
                  }`}
                >
                  <IconComponent className="h-4.5 w-4.5" />
                </motion.div>
                <span className={`relative z-10 text-[9px] tracking-wide font-bold transition-colors duration-200 ${
                  isActive ? 'text-white font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.10)]' : 'text-slate-500'
                }`}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
