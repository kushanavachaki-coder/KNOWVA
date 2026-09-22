/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User as UserIcon, 
  Settings as SettingsIcon, 
  BookOpen, 
  Bell, 
  ShieldCheck, 
  LogOut, 
  Save, 
  Edit2,
  Mail,
  ToggleLeft,
  ToggleRight,
  Info,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Eye,
  Sliders,
  Smartphone,
  Check,
  Heart
} from 'lucide-react';
import { User, UserSettings } from '../types';

interface ProfileSectionProps {
  user: User;
  settings: UserSettings;
  onUpdateUser: (updatedUser: Partial<User>) => void;
  onUpdateSettings: (updatedSettings: Partial<UserSettings>) => void;
  onSignOut: () => void;
  onNavigate: (tab: any) => void;
  uploadedCount: number;
  notesCount: number;
}

export default function ProfileSection({
  user,
  settings,
  onUpdateUser,
  onUpdateSettings,
  onSignOut,
  onNavigate,
  uploadedCount,
  notesCount
}: ProfileSectionProps) {
  // We can navigate between profile editing and general settings menu inside this view
  const [currentSubView, setCurrentSubView] = useState<'settings_menu' | 'edit_profile' | 'study_pref' | 'notifications' | 'privacy' | 'about'>('settings_menu');
  
  // Edit Profile States
  const [name, setName] = useState(user.name);
  const [studyLevel, setStudyLevel] = useState(user.studyLevel);
  const [bio, setBio] = useState(user.bio);
  const [subjectsText, setSubjectsText] = useState(user.subjects.join(', '));

  const handleSaveProfile = () => {
    const formattedSubjects = subjectsText
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    onUpdateUser({
      name,
      studyLevel,
      bio,
      subjects: formattedSubjects
    });
    setCurrentSubView('settings_menu');
  };

  // Toggle helper
  const ToggleRow = ({ 
    label, 
    description, 
    value, 
    onToggle 
  }: { 
    label: string; 
    description: string; 
    value: boolean; 
    onToggle: () => void 
  }) => (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-100 last:border-0 text-left">
      <div className="space-y-0.5 max-w-[75%]">
        <h4 className="text-xs font-bold text-slate-700">{label}</h4>
        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{description}</p>
      </div>
      <button 
        onClick={onToggle}
        className="text-slate-400 hover:text-sky-600 transition-colors cursor-pointer focus:outline-none"
      >
        {value ? (
          <ToggleRight className="h-6 w-6 text-sky-500" />
        ) : (
          <ToggleLeft className="h-6 w-6 text-slate-300" />
        )}
      </button>
    </div>
  );

  // Stagger configurations
  const pageVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.15 } }
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-full max-w-md mx-auto space-y-4 pb-24 text-left"
    >
      
      {/* 1. EDIT PROFILE VIEW */}
      {currentSubView === 'edit_profile' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Edit Personal Profile</h3>
            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="text-xs text-sky-600 font-bold"
            >
              Back
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex justify-center py-2">
              <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-sky-500/10">
                {name ? name[0].toUpperCase() : 'S'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-500 font-bold">Display Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-500 font-bold">Course / Study Level</label>
              <input 
                type="text" 
                value={studyLevel} 
                onChange={(e) => setStudyLevel(e.target.value)}
                placeholder="e.g. Undergraduate, Medical Student"
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-500 font-bold">Active Syllabus Subjects (comma separated)</label>
              <input 
                type="text" 
                value={subjectsText} 
                onChange={(e) => setSubjectsText(e.target.value)}
                placeholder="Biology, Pathology, Anatomy"
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-500 font-bold">Syllabus Goal / Bio</label>
              <textarea 
                value={bio} 
                onChange={(e) => setBio(e.target.value)}
                placeholder="Describe your current study goal..."
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-all font-semibold h-20 resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setCurrentSubView('settings_menu')}
                className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveProfile}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold transition-all shadow-md shadow-sky-500/10 cursor-pointer text-center"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. STUDY PREFERENCES VIEW */}
      {currentSubView === 'study_pref' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Study Preferences</h3>
            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="text-xs text-sky-600 font-bold"
            >
              Back
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-500 font-bold block">Preferred Answer Style</label>
              <select 
                value={settings.answerStyle}
                onChange={(e) => onUpdateSettings({ answerStyle: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
              >
                <option value="academic">Academic & Detailed (Strict Facts)</option>
                <option value="conversational">Conversational Tutor (Interactive Socratic)</option>
                <option value="simple">Plain Explanations (Feynman Method)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-500 font-bold block">Response Detail</label>
              <select 
                value={settings.responseType}
                onChange={(e) => onUpdateSettings({ responseType: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-700 font-semibold focus:outline-none focus:border-sky-500 focus:bg-white transition-all"
              >
                <option value="detailed">Thorough Explanations</option>
                <option value="concise">Bullet points & key findings only</option>
              </select>
            </div>

            <ToggleRow 
              label="Exam-Focused Mode"
              description="Prioritize exam scoring mnemonics, high-yield questions, and test predictions"
              value={settings.examOriented}
              onToggle={() => onUpdateSettings({ examOriented: !settings.examOriented })}
            />

            <ToggleRow 
              label="Allow Supplemental Context"
              description="Authorize the model to integrate general knowledge when uploaded study files are incomplete"
              value={settings.allowExtraInfo}
              onToggle={() => onUpdateSettings({ allowExtraInfo: !settings.allowExtraInfo })}
            />

            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold transition-all shadow-md shadow-sky-500/10 cursor-pointer text-center"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 3. NOTIFICATIONS VIEW */}
      {currentSubView === 'notifications' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Notification Settings</h3>
            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="text-xs text-sky-600 font-bold"
            >
              Back
            </button>
          </div>

          <div className="space-y-1 text-xs">
            <ToggleRow 
              label="Daily Study Reminders"
              description="Keep up your streak and master active learning"
              value={settings.studyReminders}
              onToggle={() => onUpdateSettings({ studyReminders: !settings.studyReminders })}
            />

            <ToggleRow 
              label="Revision Spaced-Alerts"
              description="Notify when saved Study Notes are scheduled for review"
              value={settings.revisionReminders}
              onToggle={() => onUpdateSettings({ revisionReminders: !settings.revisionReminders })}
            />

            <ToggleRow 
              label="Viva Oral Challenge Alerts"
              description="Receive prompts for adaptive speaking drills based on weak syllabus topics"
              value={settings.vivaReminders}
              onToggle={() => onUpdateSettings({ vivaReminders: !settings.vivaReminders })}
            />

            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold transition-all mt-4 shadow-md shadow-sky-500/10 cursor-pointer text-center"
            >
              Save Notification Preferences
            </button>
          </div>
        </div>
      )}

      {/* 4. PRIVACY VIEW */}
      {currentSubView === 'privacy' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Data & Privacy Sandbox</h3>
            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="text-xs text-sky-600 font-bold"
            >
              Back
            </button>
          </div>

          <div className="space-y-4 text-xs leading-relaxed text-slate-600">
            <p>
              Knowva utilizes local sandbox architecture to cache source document indices and dialogue logs. Your private files are protected directly in your device container.
            </p>

            <div className="p-3.5 bg-sky-50 border border-sky-100 rounded-xl text-[10px] text-sky-700 space-y-1">
              <span className="font-extrabold block uppercase tracking-wider">Firebase Alignment Mode</span>
              <p className="font-medium">All data structures are pre-configured to match secure Firestore and Firebase Auth architectures for direct cloud capabilities deployment.</p>
            </div>

            <div className="space-y-2 pt-2">
              <button 
                onClick={() => {
                  if (confirm("Reset current study library? This permanently deletes your files and note cards.")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/50 rounded-xl font-bold text-center transition-colors cursor-pointer"
              >
                Clear All Offline Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ABOUT VIEW */}
      {currentSubView === 'about' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">About Knowva</h3>
            <button 
              onClick={() => setCurrentSubView('settings_menu')}
              className="text-xs text-sky-600 font-bold"
            >
              Back
            </button>
          </div>

          <div className="text-center py-4 space-y-3">
            <div className="h-12 w-12 bg-gradient-to-tr from-sky-500 to-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Sparkles className="h-6 w-6" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">Knowva Companion</h4>
              <p className="text-[10px] text-slate-400 font-bold">VERSION 1.2.0 • COMPLETED PRODUCTION MODEL</p>
            </div>

            <p className="text-xs text-slate-500 px-2 leading-relaxed">
              Knowva is a professional AI study companion designed to empower active recall, adaptive viva simulations, and factual workspace questioning.
            </p>

            <div className="flex items-center justify-center gap-1 text-[11px] text-sky-600 font-bold">
              <Heart className="h-3.5 w-3.5 fill-sky-200 text-sky-500" />
              <span>Dedicated to Student Success</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. PRIMARY SETTINGS MENU (Unified Profile + Settings Screen) */}
      {currentSubView === 'settings_menu' && (
        <div className="space-y-4">
          
          {/* PROFILE CARD */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm relative">
            <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 text-white flex items-center justify-center text-lg font-black shrink-0">
              {user.name ? user.name[0].toUpperCase() : 'S'}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-extrabold text-slate-800 truncate">{user.name}</h3>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-600 text-[8px] font-extrabold rounded-full uppercase border border-sky-100/50 shrink-0">
                  {user.studyLevel}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{user.email}</p>
            </div>

            <button 
              onClick={() => setCurrentSubView('edit_profile')}
              className="p-1.5 hover:bg-sky-50 text-sky-500 rounded-lg border border-slate-100 transition-colors cursor-pointer"
              title="Edit profile information"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* QUICK ACCOUNT STATE COUNTS */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white border border-slate-100 p-3 rounded-2xl flex items-center gap-2.5 shadow-sm">
              <div className="p-2 bg-sky-50 text-sky-600 border border-sky-100 rounded-xl">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">DOCUMENTS</span>
                <span className="text-xs font-bold text-slate-800">{uploadedCount} Active</span>
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-3 rounded-2xl flex items-center gap-2.5 shadow-sm">
              <div className="p-2 bg-cyan-50 text-cyan-600 border border-cyan-100 rounded-xl">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="text-left">
                <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">STUDY CARDS</span>
                <span className="text-xs font-bold text-slate-800">{notesCount} Saved</span>
              </div>
            </div>
          </div>

          {/* SETTINGS OPTIONS SYSTEM ROWS (Aesthetic iOS/Android Style List) */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-1">
              Application Settings
            </h3>

            <div className="bg-white border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-sm">
              
              {/* Profile details link */}
              <button 
                onClick={() => setCurrentSubView('edit_profile')}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">Personal Profile</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Course, subject levels, bio details</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>

              {/* Study preferences link */}
              <button 
                onClick={() => setCurrentSubView('study_pref')}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-sky-50 text-sky-600 border border-sky-100 rounded-lg">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">Study Preferences</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Tutor style, exam modes, response details</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>

              {/* Notifications link */}
              <button 
                onClick={() => setCurrentSubView('notifications')}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-cyan-50 text-cyan-600 border border-cyan-100 rounded-lg">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">Reminders & Notifications</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Daily review streak, spacing, viva alerts</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>

              {/* Appearance config (Theme is hardcoded to Light theme in requirements, so we explain) */}
              <div className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">Appearance & Themes</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Currently customized to energetic Light theme</span>
                  </div>
                </div>
                <span className="text-[9px] bg-amber-500/10 text-amber-600 font-extrabold border border-amber-500/15 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                  Active Light
                </span>
              </div>

              {/* Data and privacy */}
              <button 
                onClick={() => setCurrentSubView('privacy')}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">Data & Privacy Sandbox</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Local cache files, device persistence bounds</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>

              {/* About app */}
              <button 
                onClick={() => setCurrentSubView('about')}
                className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg">
                    <Info className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 block">About Knowva Study App</span>
                    <span className="text-[9px] text-slate-400 font-medium block">Application version, team goals</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>

            </div>
          </div>

          {/* SIGN OUT / RESET BUTTONS */}
          <div className="pt-2 space-y-2">
            <button
              onClick={onSignOut}
              className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/40 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out Session</span>
            </button>
          </div>

        </div>
      )}

    </motion.div>
  );
}
