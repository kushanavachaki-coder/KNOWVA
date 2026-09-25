        </div>

        {/* Source Material Selector */}
        <div className="p-5 bg-gradient-to-br from-white via-sky-50 to-cyan-50 border border-sky-200/80 rounded-2xl space-y-4 shadow-[0_8px_20px_rgba(14,165,233,0.11)]">
          <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-sky-500" />
            <span>Select Syllabus Source Material</span>
          </h3>

          {uploadedMaterials.length === 0 ? (
            <div className="p-4 bg-white/80 border border-sky-100 rounded-xl text-center space-y-2 shadow-[0_4px_12px_rgba(14,165,233,0.08)]">
              <p className="text-xs text-slate-600 font-semibold">
                No syllabus materials uploaded yet. Upload a document in Study Materials to start Viva Practice.
              </p>
              <button 
                onClick={onNavigateToAsk}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer border-none inline-flex items-center gap-1"
              >
                <span>Go to Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {uploadedMaterials.map(mat => {
                const isSelected = selectedMaterial?.id === mat.id;
                return (
                  <div
                    key={mat.id}
                    onClick={() => setSelectedMaterial(mat)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                      isSelected 
                        ? 'bg-sky-50/80 border-sky-300 shadow-sm' 
                        : 'bg-slate-50/60 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className={`h-4 w-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 truncate block">{mat.name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block">
                          {mat.type.toUpperCase()} • {mat.fileSize || 'Syllabus Source'}
                        </span>
                      </div>
                    </div>
                    <motion.div
                      initial={false}
                      animate={{ x: isSelected ? 0 : -2, opacity: 1, scale: isSelected ? 1 : 0.9 }}
                      whileHover={{ x: 2, scale: 1.06 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18 }}
                      className={`h-6 w-6 rounded-xl flex items-center justify-center shrink-0 border shadow-[0_4px_10px_rgba(14,165,233,0.12)] ${isSelected
                        ? 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white border-sky-300'
                        : 'bg-white/80 text-sky-500 border-sky-100 group-hover:border-sky-200'}`}
                    >
                      {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drill Specs Card */}
        <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-sky-500" />
            <span>Oral Examination Parameters</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] text-slate-400 font-bold block uppercase">Select Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {(['basic', 'intermediate', 'advanced'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficultySetup(level)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      difficultySetup === level
                        ? 'bg-sky-50 border-sky-300 text-sky-700'
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">Length</span>
                <span className="text-xs font-extrabold text-slate-800">5 Questions</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[9px] text-slate-400 font-bold block uppercase">Focus</span>
                <span className="text-xs font-extrabold text-slate-800">Syllabus Grounded</span>