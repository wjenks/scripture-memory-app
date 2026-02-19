// ===== Theme Management =====
function initTheme() {
    const saved = localStorage.getItem('scriptureTheme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeIcon();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('scriptureTheme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '\u2600' : '\u263E';
}

// ===== Review Requirements =====
const PHASE_CONFIG = {
    daily:   { requiredReviews: 49, label: 'Daily',   next: 'weekly'  },
    weekly:  { requiredReviews: 28, label: 'Weekly',  next: 'monthly' },
    monthly: { requiredReviews: 84, label: 'Monthly', next: 'retired' }
};

// ===== Scripture Memory App =====
class ScriptureMemoryApp {

    constructor() {
        this.verses = JSON.parse(localStorage.getItem('scriptureVerses') || '[]');
        this.currentVerseIndex = 0;
        this.todaysVerses = [];
        this.verseHidden = false;
        this.currentView = 'practice';

        // Migrate existing verses to include review fields
        this.migrateVerses();
        this.initializeApp();
    }

    migrateVerses() {
        let changed = false;
        this.verses.forEach(verse => {
            const needsBackfill = !verse.reviews || verse.reviews.length === 0;

            if (!verse.reviews) verse.reviews = [];
            if (verse.reviewCount === undefined) verse.reviewCount = 0;
            if (verse.requiredReviews === undefined) {
                const config = PHASE_CONFIG[verse.status];
                verse.requiredReviews = config ? config.requiredReviews : 0;
                changed = true;
            }

            // Backfill reviews for old-format verses (no reviews array)
            // Assumes reviews were completed on schedule
            if (needsBackfill) {
                const backfilled = this.backfillReviews(verse);
                if (backfilled.length > 0) {
                    verse.reviews = backfilled;
                    verse.reviewCount = backfilled.filter(r => r.phase === verse.status).length;
                    changed = true;
                }
            }
        });
        if (changed) this.saveData();
    }

    backfillReviews(verse) {
        const reviews = [];
        const now = new Date();
        const addedDate = new Date(verse.addedDate);

        // --- Daily phase reviews ---
        if (verse.status === 'daily' || verse.status === 'weekly' ||
            verse.status === 'monthly' || verse.status === 'retired') {

            // If still daily, backfill one review per day up to today
            // If promoted past daily, the full 49 daily reviews were completed
            const dailyEnd = verse.promotedToWeekly
                ? new Date(verse.promotedToWeekly)
                : now;
            const dailyDays = Math.min(
                49,
                Math.floor((dailyEnd - addedDate) / (1000 * 60 * 60 * 24))
            );

            for (let i = 0; i < dailyDays; i++) {
                const d = new Date(addedDate);
                d.setDate(d.getDate() + i);
                reviews.push({
                    date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString(),
                    phase: 'daily'
                });
            }
        }

        // --- Weekly phase reviews ---
        if (verse.status === 'weekly' || verse.status === 'monthly' || verse.status === 'retired') {
            const weeklyStart = verse.promotedToWeekly ? new Date(verse.promotedToWeekly) : now;
            const weeklyEnd = verse.promotedToMonthly
                ? new Date(verse.promotedToMonthly)
                : now;
            const weeklyWeeks = Math.min(
                28,
                Math.floor((weeklyEnd - weeklyStart) / (1000 * 60 * 60 * 24 * 7))
            );

            for (let i = 0; i < weeklyWeeks; i++) {
                const d = new Date(weeklyStart);
                d.setDate(d.getDate() + i * 7);
                reviews.push({
                    date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString(),
                    phase: 'weekly'
                });
            }
        }

        // --- Monthly phase reviews ---
        if (verse.status === 'monthly' || verse.status === 'retired') {
            const monthlyStart = verse.promotedToMonthly ? new Date(verse.promotedToMonthly) : now;
            const monthlyEnd = verse.retiredDate
                ? new Date(verse.retiredDate)
                : now;
            const monthlyMonths = Math.min(
                84,
                Math.floor((monthlyEnd - monthlyStart) / (1000 * 60 * 60 * 24 * 30))
            );

            for (let i = 0; i < monthlyMonths; i++) {
                const d = new Date(monthlyStart);
                d.setMonth(d.getMonth() + i);
                reviews.push({
                    date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString(),
                    phase: 'monthly'
                });
            }
        }

        return reviews;
    }

    initializeApp() {
        this.updateDateDisplay();
        this.processVerses();
        this.updateTodaysVerses();
        this.updateDisplay();
        this.updateStats();
        this.updateVerseList();
        this.initAutoBackup();

        // Auto-save every 30 seconds
        setInterval(() => this.saveData(), 30000);
    }

    updateDateDisplay() {
        const now = new Date();
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);
    }

    // ===== Promotion Logic =====
    processVerses() {
        const today = new Date();
        const currentTime = today.getTime();

        this.verses.forEach(verse => {
            const addedDate = new Date(verse.addedDate);
            const daysSinceAdded = Math.floor((currentTime - addedDate.getTime()) / (1000 * 60 * 60 * 24));

            if (verse.status === 'daily' &&
                daysSinceAdded >= 49 &&
                verse.reviewCount >= PHASE_CONFIG.daily.requiredReviews) {
                this.promoteToWeekly(verse);
            } else if (verse.status === 'weekly' &&
                       this.getWeeksSincePromotion(verse) >= 28 &&
                       verse.reviewCount >= PHASE_CONFIG.weekly.requiredReviews) {
                this.promoteToMonthly(verse);
            } else if (verse.status === 'monthly' &&
                       this.getMonthsSincePromotion(verse) >= 84 &&
                       verse.reviewCount >= PHASE_CONFIG.monthly.requiredReviews) {
                this.retireVerse(verse);
            }
        });

        this.saveData();
    }

    promoteToWeekly(verse) {
        const weeklyVerses = this.verses.filter(v => v.status === 'weekly');
        const dayOfWeek = weeklyVerses.length % 7;
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        verse.status = 'weekly';
        verse.weeklyDay = days[dayOfWeek];
        verse.promotedToWeekly = new Date().toISOString();
        verse.reviewCount = 0;
        verse.requiredReviews = PHASE_CONFIG.weekly.requiredReviews;
    }

    promoteToMonthly(verse) {
        const monthlyVerses = this.verses.filter(v => v.status === 'monthly');
        const dayOfMonth = (monthlyVerses.length % 30) + 1;

        verse.status = 'monthly';
        verse.monthlyDay = dayOfMonth;
        verse.promotedToMonthly = new Date().toISOString();
        verse.reviewCount = 0;
        verse.requiredReviews = PHASE_CONFIG.monthly.requiredReviews;
    }

    retireVerse(verse) {
        verse.status = 'retired';
        verse.retiredDate = new Date().toISOString();
        verse.reviewCount = 0;
        verse.requiredReviews = 0;
    }

    getWeeksSincePromotion(verse) {
        if (!verse.promotedToWeekly) return 0;
        const promotionDate = new Date(verse.promotedToWeekly);
        const now = new Date();
        return Math.floor((now - promotionDate) / (1000 * 60 * 60 * 24 * 7));
    }

    getMonthsSincePromotion(verse) {
        if (!verse.promotedToMonthly) return 0;
        const promotionDate = new Date(verse.promotedToMonthly);
        const now = new Date();
        return Math.floor((now - promotionDate) / (1000 * 60 * 60 * 24 * 30));
    }

    // ===== Review Completion =====
    hasReviewedToday(verse) {
        const todayStr = new Date().toISOString().slice(0, 10);
        return verse.reviews.some(r => r.date.slice(0, 10) === todayStr);
    }

    markReviewComplete(verseId) {
        const verse = this.verses.find(v => v.id === verseId);
        if (!verse) return;

        if (this.hasReviewedToday(verse)) return;

        verse.reviews.push({
            date: new Date().toISOString(),
            phase: verse.status
        });
        verse.reviewCount = verse.reviews.filter(r => r.phase === verse.status).length;

        this.saveData();
        this.processVerses();
        this.updateTodaysVerses();
        this.updateDisplay();
    }

    addReviewEntry(verseId, dateStr) {
        const verse = this.verses.find(v => v.id === verseId);
        if (!verse) return;

        // Check if already reviewed on that date
        if (verse.reviews.some(r => r.date.slice(0, 10) === dateStr)) return;

        verse.reviews.push({
            date: new Date(dateStr + 'T12:00:00Z').toISOString(),
            phase: verse.status
        });
        verse.reviews.sort((a, b) => new Date(a.date) - new Date(b.date));
        verse.reviewCount = verse.reviews.filter(r => r.phase === verse.status).length;

        this.saveData();
        this.processVerses();
        this.updateTodaysVerses();
        this.updateDisplay();
    }

    deleteReviewEntry(verseId, index) {
        const verse = this.verses.find(v => v.id === verseId);
        if (!verse || index < 0 || index >= verse.reviews.length) return;

        verse.reviews.splice(index, 1);
        verse.reviewCount = verse.reviews.filter(r => r.phase === verse.status).length;

        this.saveData();
        this.processVerses();
        this.updateTodaysVerses();
        this.updateDisplay();
    }

    // ===== Today's Verses =====
    updateTodaysVerses() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const dayOfMonth = today.getDate();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        this.todaysVerses = [];

        // Daily verses
        this.verses.filter(v => v.status === 'daily').forEach(verse => {
            this.todaysVerses.push({...verse, practiceType: 'Daily Practice'});
        });

        // Weekly verses
        this.verses.filter(v => v.status === 'weekly' && v.weeklyDay === days[dayOfWeek]).forEach(verse => {
            this.todaysVerses.push({...verse, practiceType: 'Weekly Practice'});
        });

        // Monthly verses
        this.verses.filter(v => v.status === 'monthly').forEach(verse => {
            let shouldPractice = false;

            if (verse.monthlyDay <= dayOfMonth) {
                shouldPractice = true;
            }

            // February special handling
            if (today.getMonth() === 1) {
                const isLeapYear = today.getFullYear() % 4 === 0;
                const lastDay = isLeapYear ? 29 : 28;

                if (dayOfMonth === lastDay && verse.monthlyDay >= 29) {
                    shouldPractice = true;
                }
            }

            // 31-day months - no practice on 31st
            if (dayOfMonth === 31) {
                shouldPractice = false;
            }

            if (shouldPractice && verse.monthlyDay === dayOfMonth) {
                this.todaysVerses.push({...verse, practiceType: 'Monthly Practice'});
            }
        });

        this.currentVerseIndex = 0;
    }

    // ===== Display =====
    updateDisplay() {
        const practiceContent = document.getElementById('practiceContent');
        const noVersesMessage = document.getElementById('noVersesMessage');

        if (this.todaysVerses.length === 0) {
            practiceContent.classList.add('hidden');
            noVersesMessage.classList.remove('hidden');
            this.updateProgress(0);
            return;
        }

        practiceContent.classList.remove('hidden');
        noVersesMessage.classList.add('hidden');

        const currentVerse = this.todaysVerses[this.currentVerseIndex];
        document.getElementById('verseType').textContent = currentVerse.practiceType;
        document.getElementById('verseText').textContent = currentVerse.text;
        document.getElementById('verseReference').textContent = currentVerse.reference;

        // Update review progress display
        const reviewProgress = document.getElementById('reviewProgress');
        if (currentVerse.requiredReviews > 0) {
            const count = currentVerse.reviewCount || 0;
            const required = currentVerse.requiredReviews;
            const pct = Math.min(100, Math.round((count / required) * 100));
            reviewProgress.classList.remove('hidden');
            reviewProgress.innerHTML =
                `${count}/${required} reviews` +
                `<div class="review-progress-bar"><div class="review-progress-fill" style="width:${pct}%"></div></div>`;
        } else {
            reviewProgress.classList.add('hidden');
        }

        // Update review complete button
        const reviewBtn = document.getElementById('reviewCompleteBtn');
        const sourceVerse = this.verses.find(v => v.id === currentVerse.id);
        const alreadyReviewed = sourceVerse ? this.hasReviewedToday(sourceVerse) : false;

        if (alreadyReviewed) {
            reviewBtn.classList.add('completed');
            reviewBtn.disabled = true;
            reviewBtn.innerHTML = '<span class="checkmark">\u2713</span> Reviewed Today';
        } else {
            reviewBtn.classList.remove('completed');
            reviewBtn.disabled = false;
            reviewBtn.innerHTML = '<span class="checkmark">\u2713</span> Mark Reviewed';
        }

        // Update progress
        const progress = ((this.currentVerseIndex + 1) / this.todaysVerses.length) * 100;
        this.updateProgress(progress);

        // Reset verse visibility
        this.verseHidden = false;
        document.getElementById('showHideBtn').textContent = 'Hide Text';
        document.getElementById('verseText').classList.remove('hidden');
        document.getElementById('testSection').classList.add('hidden');
        document.getElementById('testBtn').classList.remove('hidden');
        document.getElementById('comparisonResult').classList.add('hidden');
        document.getElementById('verseInput').value = '';
    }

    updateProgress(percentage) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        progressFill.style.width = percentage + '%';
        progressText.textContent = Math.round(percentage) + '% Complete';
    }

    toggleVerse() {
        const verseText = document.getElementById('verseText');
        const showHideBtn = document.getElementById('showHideBtn');

        if (this.verseHidden) {
            verseText.classList.remove('hidden');
            showHideBtn.textContent = 'Hide Text';
            this.verseHidden = false;
        } else {
            verseText.classList.add('hidden');
            showHideBtn.textContent = 'Show Text';
            this.verseHidden = true;
        }
    }

    nextVerse() {
        if (this.todaysVerses.length === 0) return;

        this.currentVerseIndex = (this.currentVerseIndex + 1) % this.todaysVerses.length;
        this.updateDisplay();
    }

    startTest() {
        document.getElementById('testSection').classList.remove('hidden');
        document.getElementById('testBtn').classList.add('hidden');
        document.getElementById('verseInput').focus();
    }

    checkVerse() {
        const userInput = document.getElementById('verseInput').value.trim();
        const currentVerse = this.todaysVerses[this.currentVerseIndex];
        const correctText = currentVerse.text.toLowerCase();
        const userText = userInput.toLowerCase();

        const resultDiv = document.getElementById('comparisonResult');
        resultDiv.classList.remove('hidden');

        const similarity = this.calculateSimilarity(userText, correctText);

        if (similarity > 0.9) {
            resultDiv.className = 'comparison-result comparison-success';
            resultDiv.textContent = 'Excellent! Perfect match!';
        } else if (similarity > 0.7) {
            resultDiv.className = 'comparison-result comparison-partial';
            resultDiv.textContent = 'Good! Minor differences detected.';
        } else {
            resultDiv.className = 'comparison-result comparison-error';
            resultDiv.textContent = 'Keep practicing! Try again.';
        }

        // Show the correct text
        document.getElementById('verseText').classList.remove('hidden');
        document.getElementById('showHideBtn').textContent = 'Hide Text';
        this.verseHidden = false;
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    // ===== Verse Management =====
    addVerse() {
        const reference = document.getElementById('verseRefInput').value.trim();
        const text = document.getElementById('verseTextInput').value.trim();

        if (!reference || !text) {
            alert('Please enter both reference and text');
            return;
        }

        const newVerse = {
            id: Date.now(),
            reference: reference,
            text: text,
            addedDate: new Date().toISOString(),
            status: 'daily',
            practiceCount: 0,
            reviews: [],
            reviewCount: 0,
            requiredReviews: PHASE_CONFIG.daily.requiredReviews
        };

        this.verses.push(newVerse);
        this.saveData();
        this.updateTodaysVerses();
        this.updateDisplay();
        this.updateStats();
        this.updateVerseList();

        // Clear form
        document.getElementById('verseRefInput').value = '';
        document.getElementById('verseTextInput').value = '';

        alert('Verse added successfully!');
    }

    removeVerse(id) {
        if (confirm('Are you sure you want to remove this verse?')) {
            this.verses = this.verses.filter(v => v.id !== id);
            this.saveData();
            this.updateTodaysVerses();
            this.updateDisplay();
            this.updateStats();
            this.updateVerseList();
        }
    }

    updateVerseList() {
        const verseList = document.getElementById('verseList');
        verseList.innerHTML = '';

        this.verses.forEach(verse => {
            const verseDiv = document.createElement('div');
            verseDiv.className = 'verse-item';

            const statusText = this.getStatusText(verse);

            verseDiv.innerHTML = `
                <div class="verse-item-ref">${this.escapeHtml(verse.reference)}</div>
                <div class="verse-item-text">${this.escapeHtml(verse.text.substring(0, 100))}${verse.text.length > 100 ? '...' : ''}</div>
                <div class="verse-item-status">${statusText}</div>
                <div class="verse-item-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.openVerseModal(${verse.id}); event.stopPropagation();">Details</button>
                    <button class="btn btn-danger btn-sm" onclick="app.removeVerse(${verse.id}); event.stopPropagation();">Remove</button>
                </div>
            `;

            verseDiv.addEventListener('click', () => this.openVerseModal(verse.id));
            verseList.appendChild(verseDiv);
        });
    }

    getStatusText(verse) {
        const addedDate = new Date(verse.addedDate);
        const daysSinceAdded = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
        const reviewInfo = verse.requiredReviews > 0
            ? ` | ${verse.reviewCount || 0}/${verse.requiredReviews} reviews`
            : '';

        switch (verse.status) {
            case 'daily': {
                const daysLeft = Math.max(0, 49 - daysSinceAdded);
                return `Daily Practice (${daysLeft} days until weekly)${reviewInfo}`;
            }
            case 'weekly': {
                const weeksLeft = Math.max(0, 28 - this.getWeeksSincePromotion(verse));
                return `Weekly Practice - ${verse.weeklyDay} (${weeksLeft} weeks until monthly)${reviewInfo}`;
            }
            case 'monthly': {
                const monthsLeft = Math.max(0, 84 - this.getMonthsSincePromotion(verse));
                return `Monthly Practice - Day ${verse.monthlyDay} (${monthsLeft} months until retired)${reviewInfo}`;
            }
            case 'retired':
                return 'Retired';
            default:
                return 'Unknown';
        }
    }

    // ===== Stats =====
    updateStats() {
        const totalVerses = this.verses.length;
        const dailyVerses = this.verses.filter(v => v.status === 'daily').length;
        const weeklyVerses = this.verses.filter(v => v.status === 'weekly').length;
        const monthlyVerses = this.verses.filter(v => v.status === 'monthly').length;

        document.getElementById('totalVerses').textContent = totalVerses;
        document.getElementById('dailyVerses').textContent = dailyVerses;
        document.getElementById('weeklyVerses').textContent = weeklyVerses;
        document.getElementById('monthlyVerses').textContent = monthlyVerses;

        // Update stats verse list
        const statsVerseList = document.getElementById('statsVerseList');
        statsVerseList.innerHTML = '';

        const versesByStatus = {
            'daily': [],
            'weekly': [],
            'monthly': [],
            'retired': []
        };

        this.verses.forEach(verse => {
            if (versesByStatus[verse.status]) {
                versesByStatus[verse.status].push(verse);
            }
        });

        Object.keys(versesByStatus).forEach(status => {
            if (versesByStatus[status].length > 0) {
                const statusHeader = document.createElement('h3');
                statusHeader.textContent = status.charAt(0).toUpperCase() + status.slice(1) + ' Verses';
                statusHeader.style.cssText = 'color: var(--text-heading); margin-top: 20px; margin-bottom: 10px;';
                statsVerseList.appendChild(statusHeader);

                versesByStatus[status].forEach(verse => {
                    const verseDiv = document.createElement('div');
                    verseDiv.className = 'verse-item';

                    verseDiv.innerHTML = `
                        <div class="verse-item-ref">${this.escapeHtml(verse.reference)}</div>
                        <div class="verse-item-text">${this.escapeHtml(verse.text.substring(0, 80))}${verse.text.length > 80 ? '...' : ''}</div>
                        <div class="verse-item-status">${this.getStatusText(verse)}</div>
                    `;

                    verseDiv.addEventListener('click', () => this.openVerseModal(verse.id));
                    statsVerseList.appendChild(verseDiv);
                });
            }
        });
    }

    // ===== Verse Detail Modal =====
    openVerseModal(verseId) {
        const verse = this.verses.find(v => v.id === verseId);
        if (!verse) return;

        const overlay = document.getElementById('verseModalOverlay');
        overlay.setAttribute('data-verse-id', verseId);

        // Header
        document.getElementById('modalVerseRef').textContent = verse.reference;
        document.getElementById('modalVerseText').textContent = verse.text;

        // Status info
        const statusEl = document.getElementById('modalVerseStatus');
        statusEl.innerHTML = `<strong>Status:</strong> ${this.getStatusText(verse)}`;

        // Render review log
        this.renderReviewLog(verse);

        // Set default date for add review form
        document.getElementById('addReviewDate').value = new Date().toISOString().slice(0, 10);

        overlay.classList.add('active');
    }

    closeVerseModal() {
        document.getElementById('verseModalOverlay').classList.remove('active');
        // Refresh lists in case data changed
        this.updateVerseList();
        this.updateStats();
    }

    renderReviewLog(verse) {
        const logContainer = document.getElementById('reviewLogList');
        const countEl = document.getElementById('reviewLogCount');

        countEl.textContent = `(${verse.reviews.length} total)`;

        if (verse.reviews.length === 0) {
            logContainer.innerHTML = '<div class="no-reviews">No reviews yet</div>';
            return;
        }

        logContainer.innerHTML = '';
        // Show most recent first
        const sorted = [...verse.reviews].reverse();
        sorted.forEach((review, i) => {
            const realIndex = verse.reviews.length - 1 - i;
            const entry = document.createElement('div');
            entry.className = 'review-entry';

            const dateStr = new Date(review.date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            entry.innerHTML = `
                <div>
                    <span class="review-entry-date">${dateStr}</span>
                    <span class="review-entry-phase">${review.phase}</span>
                </div>
                <button class="review-entry-delete" onclick="app.handleDeleteReview(${realIndex})" title="Delete review">\u00D7</button>
            `;

            logContainer.appendChild(entry);
        });
    }

    handleDeleteReview(index) {
        const verseId = Number(document.getElementById('verseModalOverlay').getAttribute('data-verse-id'));
        if (!confirm('Delete this review entry?')) return;

        this.deleteReviewEntry(verseId, index);

        // Re-render modal
        const verse = this.verses.find(v => v.id === verseId);
        if (verse) {
            document.getElementById('modalVerseStatus').innerHTML =
                `<strong>Status:</strong> ${this.getStatusText(verse)}`;
            this.renderReviewLog(verse);
        }
    }

    handleAddReview() {
        const verseId = Number(document.getElementById('verseModalOverlay').getAttribute('data-verse-id'));
        const dateInput = document.getElementById('addReviewDate');
        const dateStr = dateInput.value;

        if (!dateStr) {
            alert('Please select a date');
            return;
        }

        this.addReviewEntry(verseId, dateStr);

        // Re-render modal
        const verse = this.verses.find(v => v.id === verseId);
        if (verse) {
            document.getElementById('modalVerseStatus').innerHTML =
                `<strong>Status:</strong> ${this.getStatusText(verse)}`;
            this.renderReviewLog(verse);
        }
    }

    // ===== Backup =====
    exportData() {
        const dataStr = JSON.stringify(this.verses, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "scripture_memory_backup.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    importData() {
        const fileInput = document.getElementById('importFile');
        if (!fileInput.files.length) {
            alert('Please select a file to import.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error("Invalid format");
                this.verses = imported;
                this.migrateVerses(); // Ensure imported data has review fields
                this.processVerses();
                this.updateTodaysVerses();
                this.updateDisplay();
                this.updateStats();
                this.updateVerseList();
                // Switch to Practice view so user sees their verses
                showView('practice');
                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.textContent === 'Practice') btn.classList.add('active');
                });
                alert("Import successful! " + this.verses.length + " verses loaded.");
            } catch (err) {
                alert("Import failed: " + err.message);
            }
        };
        reader.readAsText(fileInput.files[0]);
    }

    // ===== Persistence =====
    saveData() {
        localStorage.setItem('scriptureVerses', JSON.stringify(this.verses));
        this.autoBackup();
    }

    // ===== Auto-Backup =====

    // IndexedDB helpers for persisting the folder handle across sessions
    openBackupDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('ScriptureMemoryBackup', 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore('handles');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async saveDirHandle(handle) {
        const db = await this.openBackupDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'backupDir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async loadDirHandle() {
        try {
            const db = await this.openBackupDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readonly');
                const req = tx.objectStore('handles').get('backupDir');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch {
            return null;
        }
    }

    async clearDirHandle() {
        const db = await this.openBackupDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').delete('backupDir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async initAutoBackup() {
        this.backupDirHandle = null;
        this.backupFrequency = localStorage.getItem('scriptureBackupFrequency') || 'weekly';

        // Restore frequency dropdown
        const freqSelect = document.getElementById('backupFrequency');
        if (freqSelect) freqSelect.value = this.backupFrequency;

        // Check File System Access API support
        const fsSection = document.getElementById('fsApiSection');
        if (!('showDirectoryPicker' in window)) {
            if (fsSection) fsSection.innerHTML =
                '<div style="font-size:0.85em; color:var(--text-secondary); font-style:italic;">Folder sync not available in this browser. Using scheduled download.</div>';
        } else {
            // Try to restore saved folder handle from IndexedDB
            const savedHandle = await this.loadDirHandle();
            if (savedHandle) {
                // Verify permission — browser may grant silently or show a one-click prompt
                try {
                    const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
                    if (perm === 'granted') {
                        this.backupDirHandle = savedHandle;
                    }
                    // If 'prompt', we don't auto-request (needs user gesture).
                    // It will be re-requested on next save or when they click the button.
                } catch {
                    // Handle expired or invalid — ignore
                }
            }
        }

        this.updateBackupStatus();
        this.checkScheduledBackup();
    }

    async pickBackupFolder() {
        if (!('showDirectoryPicker' in window)) {
            alert('Folder sync is not supported in this browser. The app will use scheduled downloads instead.');
            return;
        }
        try {
            this.backupDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            localStorage.setItem('scriptureBackupFolderName', this.backupDirHandle.name);
            await this.saveDirHandle(this.backupDirHandle);
            await this.writeToFolder();
            this.updateBackupStatus();
        } catch (e) {
            if (e.name !== 'AbortError') {
                alert('Could not access folder: ' + e.message);
            }
        }
    }

    async reconnectBackupFolder() {
        const savedHandle = await this.loadDirHandle();
        if (!savedHandle) {
            // No saved handle, fall through to pick a new one
            return this.pickBackupFolder();
        }
        try {
            const perm = await savedHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                this.backupDirHandle = savedHandle;
                await this.writeToFolder();
                this.updateBackupStatus();
            } else {
                // Permission denied, pick a new folder
                return this.pickBackupFolder();
            }
        } catch {
            return this.pickBackupFolder();
        }
    }

    async writeToFolder() {
        if (!this.backupDirHandle) return false;
        try {
            // Verify we still have permission
            const perm = await this.backupDirHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                // Can't request permission without user gesture, skip silently
                return false;
            }

            const fileHandle = await this.backupDirHandle.getFileHandle(
                'scripture_memory_backup.json', { create: true }
            );
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(this.verses, null, 2));
            await writable.close();

            localStorage.setItem('scriptureLastAutoBackup', new Date().toISOString());
            return true;
        } catch (e) {
            console.warn('Auto-backup to folder failed:', e.message);
            return false;
        }
    }

    async autoBackup() {
        // Try folder write first
        if (this.backupDirHandle) {
            const success = await this.writeToFolder();
            if (success) {
                this.updateBackupStatus();
                return;
            }
        }
        // Folder not set or write failed — scheduled download handles it
    }

    checkScheduledBackup() {
        const lastBackup = localStorage.getItem('scriptureLastAutoBackup');
        if (!lastBackup) return; // No backup history, don't auto-download on first visit

        const lastDate = new Date(lastBackup);
        const now = new Date();
        const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);

        const threshold = this.backupFrequency === 'monthly' ? 30 : 7;

        // Only trigger scheduled download if no folder handle is set
        if (!this.backupDirHandle && daysSince >= threshold) {
            this.performScheduledDownload();
        }
    }

    performScheduledDownload() {
        const dataStr = JSON.stringify(this.verses, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `scripture_memory_backup_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        localStorage.setItem('scriptureLastAutoBackup', new Date().toISOString());
        this.updateBackupStatus();
    }

    setBackupFrequency(value) {
        this.backupFrequency = value;
        localStorage.setItem('scriptureBackupFrequency', value);
        this.updateBackupStatus();
    }

    updateBackupStatus() {
        const statusEl = document.getElementById('autoBackupStatus');
        const folderEl = document.getElementById('folderName');
        if (!statusEl) return;

        const lastBackup = localStorage.getItem('scriptureLastAutoBackup');
        const folderName = localStorage.getItem('scriptureBackupFolderName');
        const hasFolderHandle = !!this.backupDirHandle;

        let html = '';

        if (hasFolderHandle) {
            html += '<span class="status-ok">Folder sync active</span> — saves on every change<br>';
        } else if (folderName) {
            html += '<span class="status-warn">Folder disconnected — click below to reconnect</span><br>';
        } else {
            html += 'No backup folder set. Using scheduled downloads (' + this.backupFrequency + ')<br>';
        }

        if (lastBackup) {
            const d = new Date(lastBackup);
            html += 'Last backup: ' + d.toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit'
            });
        } else {
            html += 'No backups yet';
        }

        statusEl.innerHTML = html;

        // Update button text based on state
        const pickBtn = document.getElementById('pickFolderBtn');
        if (pickBtn) {
            if (hasFolderHandle) {
                pickBtn.textContent = 'Change Backup Folder';
                pickBtn.setAttribute('onclick', 'app.pickBackupFolder()');
            } else if (folderName) {
                pickBtn.textContent = 'Reconnect Folder';
                pickBtn.setAttribute('onclick', 'app.reconnectBackupFolder()');
            } else {
                pickBtn.textContent = 'Set Backup Folder';
                pickBtn.setAttribute('onclick', 'app.pickBackupFolder()');
            }
        }

        if (folderEl) {
            folderEl.textContent = hasFolderHandle
                ? 'Saving to: ' + this.backupDirHandle.name + '/scripture_memory_backup.json'
                : folderName ? 'Previously: ' + folderName + '/scripture_memory_backup.json' : '';
        }
    }

    // ===== Utility =====
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// ===== Global Functions =====
let app;

function showView(viewName) {
    ['practiceView', 'versesView', 'statsView', 'backupView'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById(viewName + 'View')?.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event?.target?.classList?.add('active');

    if (viewName === 'verses') app.updateVerseList();
    if (viewName === 'stats') app.updateStats();
}

function toggleVerse() { app.toggleVerse(); }
function nextVerse() { app.nextVerse(); }
function startTest() { app.startTest(); }
function checkVerse() { app.checkVerse(); }
function addVerse() { app.addVerse(); }

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    app = new ScriptureMemoryApp();

    // Add sample verses for new users
    if (app.verses.length === 0) {
        const sampleVerses = [
            {
                id: 1,
                reference: "John 3:16",
                text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
                addedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'daily',
                practiceCount: 0,
                reviews: [],
                reviewCount: 0,
                requiredReviews: 49
            },
            {
                id: 2,
                reference: "Romans 8:28",
                text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.",
                addedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'daily',
                practiceCount: 0,
                reviews: [],
                reviewCount: 0,
                requiredReviews: 49
            }
        ];

        app.verses = sampleVerses;
        app.saveData();
        app.updateTodaysVerses();
        app.updateDisplay();
        app.updateStats();
    }

    // Handle Enter key in verse input
    document.getElementById('verseInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            checkVerse();
        }
    });

    // Handle Enter key in add verse form
    document.getElementById('verseTextInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            addVerse();
        }
    });

    // Close modal on overlay click
    document.getElementById('verseModalOverlay').addEventListener('click', function(e) {
        if (e.target === this) app.closeVerseModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') app.closeVerseModal();
    });
});

// Offline support
window.addEventListener('online', () => console.log('Back online'));
window.addEventListener('offline', () => console.log('Gone offline'));
