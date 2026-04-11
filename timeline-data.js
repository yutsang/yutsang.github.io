// Timeline Data - Easy to update
const timelineData = {
    workExperience: [
        {
            id: "work-2025-1",
            title: "Data Scientist",
            company: "KPMG",
            duration: "Jan 2025 - Current",
            months: "Ongoing",
            description:
                "Data science and analytics in a professional services context: client projects across modeling, reporting, and insight delivery in finance and related domains.",
            year: 2025,
            type: "work"
        },
        {
            id: "work-2022-1",
            title: "Digital & Data Intern",
            company: "DBS Bank – Treasury & Markets",
            duration: "Feb 2022 - Jun 2022",
            months: "5 months",
            description: "Automated data collection flow and designed Tableau dashboards for financial spreading and analysis. Initiated customers' money flow analysis to discover currency mismatch opportunities by Power BI.",
            year: 2022,
            type: "work"
        }
    ],
    education: [
        {
            id: "study-2023-1",
            title: "MSc in Enterprise Engineering Management",
            institution: "HKUST",
            duration: "Sep 2023 - Jan 2025",
            months: "17 months",
            description: "",
            year: 2023,
            type: "study"
        },
        {
            id: "study-2019-1",
            title: "BEng in Industrial Engineering and Engineering Management",
            institution: "HKUST",
            duration: "Sep 2019 - Jun 2023",
            months: "45 months",
            description: "Second Upper • HKU-PKU Summer Exchange 2021 & Fudan University SOE Winter Exchange 2022",
            year: 2019,
            type: "study"
        }
    ],
    achievements: [
        {
            id: "achievement-2025-1",
            title: "HK MBS Digital Economy Business Simulation Competition 2025",
            institution: "International Association of Business Management Simulation",
            duration: "May 2025 - May 2025",
            months: "1 month",
            description: "Business Simulation",
            year: 2025,
            type: "achievement"
        },
        {
            id: "achievement-2023-1",
            title: "LF Logistics – Final Year Project: Fleet ETA Prediction",
            institution: "Leading Project",
            duration: "Jun 2023 - Jun 2023",
            months: "1 month",
            description: "Fleet Estimated Time of Arrival Prediction System",
            year: 2023,
            type: "achievement"
        },
        {
            id: "achievement-2022-1",
            title: "Hong Kong Logistics Association Case Contest",
            institution: "2nd Runner-Up & Best Cost Effective Solution",
            duration: "Jun 2022 - Jun 2022",
            months: "1 month",
            description: "Led team to 2nd Runner-Up position with Best Cost Effective Solution award",
            year: 2022,
            type: "achievement"
        },
        {
            id: "achievement-2021-1",
            title: "CILTHK Student Day 2021 Case Competition",
            institution: "1st Runner-Up",
            duration: "Apr 2021 - Apr 2021",
            months: "1 month",
            description: "Case competition achievement",
            year: 2021,
            type: "achievement"
        }
    ],
    certificates: {
        professional: [
            "CISM - Certified Information Security Manager",
            "CISA - Certified Information Systems Auditor",
            "HKICPA - In progress (Present)",
            "Microsoft Azure - Data Scientist Associate",
            "ISC2 - Systems Security Certified Practitioner"
        ],
        dataAI: [
            "Google - Advanced Data Analytics",
            "IBM - AI Engineering, Data Engineering",
            "Python - PySpark, Kedro, PyTorch",
            "Database - SQL",
            "Visualization - Tableau, Power BI, Alteryx"
        ]
    }
};

// Function to parse date range and get start/end dates (supports "Current" / "Present" as end)
function parseDateRange(duration) {
    if (!duration || typeof duration !== 'string') {
        return { start: null, end: null };
    }

    const parts = duration.split(' - ');
    if (parts.length !== 2) {
        return { start: null, end: null };
    }

    const startStr = parts[0].trim();
    const endStr = parts[1].trim();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const startParts = startStr.split(' ');
    if (startParts.length !== 2) {
        return { start: null, end: null };
    }

    const startMonth = months.indexOf(startParts[0]);
    const startYear = parseInt(startParts[1], 10);
    if (startMonth === -1 || isNaN(startYear)) {
        return { start: null, end: null };
    }

    const now = new Date();
    let endMonth;
    let endYear;

    if (/^(Current|Present)$/i.test(endStr)) {
        endMonth = now.getMonth();
        endYear = now.getFullYear();
    } else {
        const endParts = endStr.split(' ');
        if (endParts.length !== 2) {
            return { start: null, end: null };
        }
        endMonth = months.indexOf(endParts[0]);
        endYear = parseInt(endParts[1], 10);
        if (endMonth === -1 || isNaN(endYear)) {
            return { start: null, end: null };
        }
    }

    return {
        start: { month: startMonth, year: startYear },
        end: { month: endMonth, year: endYear }
    };
}

function escapeHtml(raw) {
    if (raw == null || raw === '') return '';
    return String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function monthIndexFromRange(dr) {
    return dr.year * 12 + dr.month;
}

function certToListItem(cert) {
    const s = String(cert);
    const i = s.indexOf(' - ');
    if (i === -1) {
        return `<li>${escapeHtml(s)}</li>`;
    }
    return `<li><strong>${escapeHtml(s.slice(0, i))}</strong> — ${escapeHtml(s.slice(i + 3))}</li>`;
}

// Function to render timeline
function renderTimeline() {
    const timelineContainer = document.querySelector('.timeline');
    if (!timelineContainer) {
        return;
    }

    timelineContainer.innerHTML = '';

    const allItems = [...timelineData.workExperience, ...timelineData.education]
        .map((item) => ({
            ...item,
            dateRange: parseDateRange(item.duration)
        }))
        .filter((item) => item.dateRange.start && item.dateRange.end);

    if (allItems.length === 0) {
        timelineContainer.innerHTML =
            '<p class="timeline-empty">No timeline data available.</p>';
        return;
    }

    allItems.sort((a, b) => {
        const eb = monthIndexFromRange(b.dateRange.end);
        const ea = monthIndexFromRange(a.dateRange.end);
        if (eb !== ea) return eb - ea;
        const sb = monthIndexFromRange(b.dateRange.start);
        const sa = monthIndexFromRange(a.dateRange.start);
        if (sb !== sa) return sb - sa;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const list = document.createElement('ol');
    list.className = 'timeline-cards';

    let lastYearHeading = null;

    allItems.forEach((item) => {
        const endYear = item.dateRange.end.year;
        if (endYear !== lastYearHeading) {
            lastYearHeading = endYear;
            const y = document.createElement('li');
            y.className = 'timeline-year-heading';
            y.innerHTML = `<span>${escapeHtml(String(endYear))}</span>`;
            list.appendChild(y);
        }

        const li = document.createElement('li');
        li.className = `timeline-card ${item.type}-item`;

        const org = item.company || item.institution || '';
        const subtitle = [org, item.duration].filter(Boolean).join(' • ');

        const article = document.createElement('article');
        article.className = 'timeline-content';

        article.innerHTML = `
            <div class="timeline-header">
                <h4>${escapeHtml(item.title || 'Untitled')}</h4>
                ${item.months ? `<div class="timeline-duration">${escapeHtml(item.months)}</div>` : ''}
            </div>
            <h5>${escapeHtml(subtitle)}</h5>
            ${item.description ? `<p class="timeline-description">${escapeHtml(item.description)}</p>` : ''}
        `;

        li.appendChild(article);
        list.appendChild(li);
    });

    timelineContainer.classList.add('timeline--stacked');
    timelineContainer.setAttribute('role', 'region');
    timelineContainer.setAttribute('aria-label', 'Work and study timeline');
    timelineContainer.appendChild(list);
}

// Function to render CaseCom items
function renderCaseCom() {
    const casecomGrid = document.querySelector('.casecom-grid');
    if (!casecomGrid) return;

    casecomGrid.innerHTML = timelineData.achievements.map((item) => `
        <div class="casecom-item">
            <h4>${escapeHtml(item.title)}</h4>
            <div class="casecom-institution">${escapeHtml(item.institution)}</div>
            <div class="casecom-duration">${escapeHtml(item.duration)} • ${escapeHtml(item.months)}</div>
            <div class="casecom-description">${escapeHtml(item.description)}</div>
        </div>
    `).join('');
}

// Function to render certificates
function renderCertificates() {
    const certificatesGrid = document.querySelector('.certificates-grid');
    if (!certificatesGrid) return;

    certificatesGrid.innerHTML = `
        <div class="certificate-category">
            <h4>Professional Certificates</h4>
            <ul>
                ${timelineData.certificates.professional.map(certToListItem).join('')}
            </ul>
        </div>
        <div class="certificate-category">
            <h4>Data & AI Certificates</h4>
            <ul>
                ${timelineData.certificates.dataAI.map(certToListItem).join('')}
            </ul>
        </div>
    `;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        renderTimeline();
        renderCaseCom();
        renderCertificates();
    } catch (error) {
        console.error('Error initializing timeline:', error);
    }
}); 