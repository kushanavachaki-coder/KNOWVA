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
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="h-8 w-8 bg-gradient-to-tr from-sky-500 to-blue-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-sky-500/20"
          >
            <Sparkles className="h-4 w-4" />
          </motion.div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold tracking-widest text-sky-600 group-hover:text-sky-700 transition-colors">KNOWVA</span>
              <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse"></span>
            </div>
            <span className="text-[8px] text-sky-600 font-bold tracking-widest block leading-none uppercase">
              SMARTER STUDY, SIMPLIFIED
            </span>
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
              <button
                key={item.id}
                id={`mobile-nav-tab-${item.id}`}
                onClick={() => onTabChange(item.id)}
                className="relative flex flex-col items-center justify-center w-14 h-full gap-0.5 text-center cursor-pointer focus:outline-none"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicatorMobile"
                    className="absolute w-12 h-10 bg-sky-50 border border-sky-100/50 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}
                <div className={`transition-colors duration-200 ${
                  isActive ? 'text-sky-600' : 'text-slate-400'
                }`}>
                  <IconComponent className="h-4.5 w-4.5" />
                </div>
                <span className={`text-[9px] tracking-wide font-bold transition-colors duration-200 ${
                  isActive ? 'text-sky-600 font-extrabold' : 'text-slate-500'
                }`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
