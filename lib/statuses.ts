// /lib/statuses.ts

export const LEAD_STATUSES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Pending Photos',
  'Sent To Client',
  'Looking for home',
  'Callback',

  // archived / dead
  'Boiler Above 86%',
  'No Benefits',
  'Dead Number',
  'Not Interested',
  'Do Not Call',
  'Voicemail',
  'No Answer',
  'VM 5+ days',
  'NA 5+ days',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const ACTIVE_STATUSES: LeadStatus[] = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Pending Photos',
  'Sent To Client',
  'Looking for home',
  'Callback',
]

export const ARCHIVE_STATUSES: LeadStatus[] = [
  'Boiler Above 86%',
  'No Benefits',
  'Dead Number',
  'Not Interested',
  'Do Not Call',
  'Voicemail',
  'No Answer',
  'VM 5+ days',
  'NA 5+ days',
]

export const DEFAULT_STATUS: LeadStatus = 'New Lead'
export const DEFAULT_SOURCE = 'Import'
