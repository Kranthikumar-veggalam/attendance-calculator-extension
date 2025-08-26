// --- popup.js ---
// This is the main logic file. It injects a script into the current page to scrape data.
document.getElementById('calculateBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Calculating...';
  
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const attendanceUrl = "https://samvidha.iare.ac.in/home?action=stud_att_STD";

  // If the current tab is already the attendance page, run the script directly.
  if (activeTab.url && activeTab.url.includes("stud_att_STD")) {
    runScriptOnTab(activeTab.id);
  } else {
    // If not, open the attendance page and wait for it to load before running the script.
    chrome.tabs.update(activeTab.id, { url: attendanceUrl });
    
    // Set up a listener to wait for the page to finish loading after the redirect.
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      // Check if the update is for the correct tab and if the page has fully loaded.
      if (tabId === activeTab.id && changeInfo.status === 'complete' && tab.url.includes("stud_att_STD")) {
        // Run the script on the now-loaded page.
        runScriptOnTab(tabId);
        // Remove the listener to prevent it from running again.
        chrome.tabs.onUpdated.removeListener(listener);
      }
    });
  }
});

/**
 * Runs the scraping and calculation script on a specified tab.
 * @param {number} tabId - The ID of the tab to run the script on.
 */
async function runScriptOnTab(tabId) {
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: getAttendanceData,
    });

    const attendanceData = injectionResults[0].result;

    if (attendanceData && attendanceData.length > 0) {
      statusDiv.textContent = ''; // Clear status message

      let totalConducted = 0;
      let totalAttended = 0;

      // Calculate total attendance first
      attendanceData.forEach(subject => {
        totalConducted += subject.conducted;
        totalAttended += subject.attended;
      });

      const overallPercentage = (totalAttended / totalConducted) * 100;
      const overallPeriodsNeeded = calculatePeriodsNeeded(totalConducted, totalAttended, 75);

      const overallCard = document.createElement('div');
      overallCard.classList.add('overall-card');
      const overallPercentageClass = overallPercentage >= 75 ? 'percentage-good' : 'percentage-bad';
      const periodsNeededText = overallPeriodsNeeded > 0 ? `${overallPeriodsNeeded} more classes needed` : 'Attendance is satisfactory!';
      
      overallCard.innerHTML = `
        <h2>Overall Attendance</h2>
        <div class="stats">
          <p>Attended: <span>${totalAttended}</span></p>
          <p>Conducted: <span>${totalConducted}</span></p>
        </div>
        <p class="percentage-text ${overallPercentageClass}">${overallPercentage.toFixed(2)}%</p>
        <p class="periods-needed">${periodsNeededText}</p>
      `;
      resultsDiv.appendChild(overallCard);

      // Then, display individual subject attendance
      attendanceData.forEach(subject => {
        const percentage = (subject.attended / subject.conducted) * 100;
        const periodsNeeded = calculatePeriodsNeeded(subject.conducted, subject.attended, 75);
        
        const card = document.createElement('div');
        card.classList.add('subject-card');
        
        const percentageClass = percentage >= 75 ? 'percentage-good' : 'percentage-bad';
        const individualPeriodsNeededText = periodsNeeded > 0 ? `${periodsNeeded} more class${periodsNeeded > 1 ? 'es' : ''} needed.` : 'Attendance is satisfactory!';

        card.innerHTML = `
          <div class="subject-title">${subject.name}</div>
          <div class="details">Attended: <span>${subject.attended}</span> / Conducted: <span>${subject.conducted}</span></div>
          <div class="percentage-text ${percentageClass}">Percentage: ${percentage.toFixed(2)}%</div>
          <div class="details">For 75%: <span>${individualPeriodsNeededText}</span></div>
        `;
        resultsDiv.appendChild(card);
      });
      
    } else {
      resultsDiv.innerHTML = '';
      statusDiv.textContent = 'Could not find attendance data. Please navigate to the attendance report page and try again.';
    }
  } catch (error) {
    statusDiv.textContent = 'An error occurred. Make sure you are on the correct page.';
    console.error('Script injection failed:', error);
  }
}

/**
 * Calculates the number of periods needed to reach a target percentage.
 * @param {number} conducted - The total number of classes conducted.
 * @param {number} attended - The number of classes attended.
 * @param {number} targetPercentage - The target percentage (e.g., 75).
 * @returns {number} - The number of classes needed, or 0 if already at or above target.
 */
function calculatePeriodsNeeded(conducted, attended, targetPercentage) {
  const currentPercentage = (attended / conducted) * 100;
  if (currentPercentage >= targetPercentage) {
    return 0;
  }
  // This formula accounts for both attended and conducted classes increasing.
  const targetFraction = targetPercentage / 100;
  const needed = ((targetFraction * conducted) - attended) / (1 - targetFraction);
  return Math.ceil(needed);
}


// IMPORTANT: This function runs on the college website's page.
// The selectors have been updated to be more specific based on the provided screenshot.
function getAttendanceData() {
  // Find the table by searching for the "Attendance Report" heading.
  // This is a more robust way to find the correct table on the page.
  const allTables = document.querySelectorAll('table');
  let attendanceTable = null;

  allTables.forEach(table => {
    // Look for a heading or other text that indicates this is the correct table
    const tableHeaders = table.querySelectorAll('th');
    const hasCorrectHeaders = Array.from(tableHeaders).some(header => {
      const headerText = header.textContent.trim();
      return headerText === 'Course Code' || headerText === 'Conducted';
    });

    if (hasCorrectHeaders) {
      attendanceTable = table;
    }
  });

  if (!attendanceTable) {
    // Fallback: If the header search fails, try to find a table near the "ATTENDANCE REPORT" h2.
    const h2 = document.querySelector('h2');
    if (h2 && h2.textContent.trim() === 'ATTENDANCE REPORT') {
      const nextSibling = h2.nextElementSibling;
      if (nextSibling && nextSibling.tagName === 'TABLE') {
        attendanceTable = nextSibling;
      }
    }
  }

  if (!attendanceTable) {
    return null; // Return null if the table cannot be found
  }

  // Get all rows in the table body, skipping the header row
  const rows = attendanceTable.querySelectorAll('tbody tr');
  const data = [];

  // Iterate over the rows to extract data
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');

    // The image shows the columns for Course Name at index 2, Conducted at index 5, and Attended at index 6
    if (cells.length > 6) {
      const subjectName = cells[2].textContent.trim();
      const conducted = parseInt(cells[5].textContent.trim(), 10);
      const attended = parseInt(cells[6].textContent.trim(), 10);
      
      // Check if the parsed values are valid numbers before pushing
      if (!isNaN(conducted) && !isNaN(attended)) {
        data.push({
          name: subjectName,
          conducted: conducted,
          attended: attended
        });
      }
    }
  });

  return data;
}
