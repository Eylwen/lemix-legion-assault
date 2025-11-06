import { useState, useEffect } from 'react'
import './App.css'

// Assault schedule constants
const ASSAULT_DURATION_HOURS = 6
const WAIT_DURATION_HOURS = 8.5
const CYCLE_DURATION_HOURS = ASSAULT_DURATION_HOURS + WAIT_DURATION_HOURS // 14.5 hours

// Region configurations
type Region = 'EU' | 'US'

interface RegionConfig {
  timezoneOffset: number // Hours offset from UTC
  referenceStartTime: number | null // UTC timestamp, or null if no reference
}

const REGION_CONFIGS: Record<Region, RegionConfig> = {
  EU: {
    timezoneOffset: 1, // UTC+1
    referenceStartTime: new Date('2025-11-06T13:00:00Z').getTime() // 14:00 ST = 13:00 UTC
  },
  US: {
    timezoneOffset: -5, // UTC-5 (EST) - adjust as needed
    referenceStartTime: null // No reference time available yet
  }
}

interface AssaultStatus {
  isActive: boolean
  timeRemaining: number // in milliseconds
  nextStartTime: number // timestamp (UTC)
  currentStartTime: number // timestamp (UTC)
  currentEndTime: number // timestamp (UTC)
  hasReference: boolean
}

function calculateAssaultStatus(region: Region): AssaultStatus {
  const config = REGION_CONFIGS[region]
  
  // If no reference time, return a status indicating no reference
  if (config.referenceStartTime === null) {
    return {
      isActive: false,
      timeRemaining: 0,
      nextStartTime: 0,
      currentStartTime: 0,
      currentEndTime: 0,
      hasReference: false
    }
  }
  
  const now = Date.now()
  
  // Calculate how many milliseconds have passed since the reference start
  const timeSinceReference = now - config.referenceStartTime
  
  // Convert to hours
  const hoursSinceReference = timeSinceReference / (1000 * 60 * 60)
  
  // Find position in current cycle (0 to CYCLE_DURATION_HOURS)
  const positionInCycle = hoursSinceReference % CYCLE_DURATION_HOURS
  
  // Determine if we're in an active assault or waiting period
  const isActive = positionInCycle < ASSAULT_DURATION_HOURS
  
  // Calculate the start time of the current cycle
  const cyclesSinceReference = Math.floor(hoursSinceReference / CYCLE_DURATION_HOURS)
  const currentCycleStartTime = config.referenceStartTime + (cyclesSinceReference * CYCLE_DURATION_HOURS * 60 * 60 * 1000)
  
  // If we're past the assault period in this cycle, move to next cycle
  let currentStartTime: number
  let currentEndTime: number
  let nextStartTime: number
  
  if (isActive) {
    // Currently in an active assault
    currentStartTime = currentCycleStartTime
    currentEndTime = currentStartTime + (ASSAULT_DURATION_HOURS * 60 * 60 * 1000)
    const timeRemainingInCycle = (ASSAULT_DURATION_HOURS - positionInCycle) * 60 * 60 * 1000
    nextStartTime = currentEndTime + (WAIT_DURATION_HOURS * 60 * 60 * 1000)
    
    return {
      isActive: true,
      timeRemaining: timeRemainingInCycle,
      nextStartTime,
      currentStartTime,
      currentEndTime,
      hasReference: true
    }
  } else {
    // Currently in waiting period - next assault starts at the next cycle
    nextStartTime = currentCycleStartTime + (CYCLE_DURATION_HOURS * 60 * 60 * 1000)
    currentStartTime = nextStartTime
    currentEndTime = currentStartTime + (ASSAULT_DURATION_HOURS * 60 * 60 * 1000)
    const timeRemainingInWait = (CYCLE_DURATION_HOURS - positionInCycle) * 60 * 60 * 1000
    
    return {
      isActive: false,
      timeRemaining: timeRemainingInWait,
      nextStartTime,
      currentStartTime,
      currentEndTime,
      hasReference: true
    }
  }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

// Convert UTC timestamp to Server Time and format as date/time string
function formatServerTime(timestamp: number, timezoneOffset: number): string {
  const utcDate = new Date(timestamp)
  
  // Get UTC components
  let year = utcDate.getUTCFullYear()
  let month = utcDate.getUTCMonth() + 1 // getUTCMonth() returns 0-11
  let day = utcDate.getUTCDate()
  let hours = utcDate.getUTCHours() + timezoneOffset
  const minutes = utcDate.getUTCMinutes()
  
  // Handle hour overflow/underflow
  if (hours >= 24) {
    hours -= 24
    day += 1
    
    // Handle day overflow
    const daysInMonth = new Date(year, month, 0).getDate()
    if (day > daysInMonth) {
      day = 1
      month += 1
      
      // Handle month overflow
      if (month > 12) {
        month = 1
        year += 1
      }
    }
  } else if (hours < 0) {
    hours += 24
    day -= 1
    
    // Handle day underflow
    if (day < 1) {
      month -= 1
      if (month < 1) {
        month = 12
        year -= 1
      }
      const daysInMonth = new Date(year, month, 0).getDate()
      day = daysInMonth
    }
  }
  
  // Format with leading zeros
  const formattedDay = String(day).padStart(2, '0')
  const formattedMonth = String(month).padStart(2, '0')
  const formattedHours = String(hours).padStart(2, '0')
  const formattedMinutes = String(minutes).padStart(2, '0')
  
  const offsetSign = timezoneOffset >= 0 ? '+' : ''
  return `${formattedDay}/${formattedMonth}/${year} ${formattedHours}:${formattedMinutes} ST (UTC${offsetSign}${timezoneOffset})`
}

function getRegionFromHash(): Region {
  const hash = window.location.hash.slice(1).toUpperCase()
  return hash === 'EU' || hash === 'US' ? hash : 'EU'
}

function App() {
  const [region, setRegion] = useState<Region>(getRegionFromHash())
  const [status, setStatus] = useState<AssaultStatus>(calculateAssaultStatus(getRegionFromHash()))

  // Initialize region from hash and listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const newRegion = getRegionFromHash()
      setRegion(newRegion)
    }

    // Set initial hash if not present
    const initialRegion = getRegionFromHash()
    if (!window.location.hash || window.location.hash.slice(1).toUpperCase() !== initialRegion) {
      window.location.hash = initialRegion
    }

    // Listen for hash changes (browser back/forward)
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, []) // Only run on mount

  // Update hash when region changes
  useEffect(() => {
    if (window.location.hash.slice(1).toUpperCase() !== region) {
      window.location.hash = region
    }
  }, [region])

  // Update status when region changes
  useEffect(() => {
    // Update status when region changes
    setStatus(calculateAssaultStatus(region))
    
    // Update every second
    const interval = setInterval(() => {
      setStatus(calculateAssaultStatus(region))
    }, 1000)

    return () => clearInterval(interval)
  }, [region])

  const config = REGION_CONFIGS[region]
  const timezoneLabel = region === 'EU' ? 'UTC+1' : `UTC${config.timezoneOffset >= 0 ? '+' : ''}${config.timezoneOffset}`

  return (
    <div className="app">
      <div className="container">
        <h1>WoW Legion Remix</h1>
        <h2>Legion Assault Timer</h2>
        
        <div className="region-toggle">
          <button
            className={`region-button ${region === 'EU' ? 'active' : ''}`}
            onClick={() => setRegion('EU')}
          >
            EU
          </button>
          <button
            className={`region-button ${region === 'US' ? 'active' : ''}`}
            onClick={() => setRegion('US')}
          >
            US
          </button>
        </div>
        
        <div className={`status-card ${status.hasReference ? (status.isActive ? 'active' : 'waiting') : 'no-reference'}`}>
          {!status.hasReference ? (
            <div className="no-reference-message">
              <div className="status-indicator">
                <span className="status-icon">❓</span>
                <span className="status-text">No Reference Available</span>
              </div>
              <p>We don't currently have a reference time to start tracking US server assaults.</p>
            </div>
          ) : status.isActive ? (
            <>
              <div className="status-indicator active-indicator">
                <span className="status-icon">⚔️</span>
                <span className="status-text">Assault Active</span>
              </div>
              <div className="time-display">
                <div className="time-label">Time Remaining</div>
                <div className="time-value">{formatTime(status.timeRemaining)}</div>
              </div>
              <div className="time-info">
                <div className="time-info-row">
                  <span className="time-info-label">Started:</span>
                  <span className="time-info-value">{formatServerTime(status.currentStartTime, config.timezoneOffset)}</span>
                </div>
                <div className="time-info-row">
                  <span className="time-info-label">Ends:</span>
                  <span className="time-info-value">{formatServerTime(status.currentEndTime, config.timezoneOffset)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="status-indicator waiting-indicator">
                <span className="status-icon">⏳</span>
                <span className="status-text">Assault Inactive</span>
              </div>
              <div className="time-display">
                <div className="time-label">Next Assault In</div>
                <div className="time-value">{formatTime(status.timeRemaining)}</div>
              </div>
              <div className="time-info">
                <div className="time-info-row">
                  <span className="time-info-label">Next Start:</span>
                  <span className="time-info-value">{formatServerTime(status.nextStartTime, config.timezoneOffset)}</span>
                </div>
                <div className="time-info-row">
                  <span className="time-info-label">Next End:</span>
                  <span className="time-info-value">{formatServerTime(status.currentEndTime, config.timezoneOffset)}</span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="info">
          <p className="timezone-note">All times shown in Server Time (ST, {timezoneLabel})</p>
        </div>
      </div>
    </div>
  )
}

export default App
