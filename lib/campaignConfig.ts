// src/lib/campaignConfig.ts

export type CampaignKey = 'ECO4' | 'SOLAR' | 'PCP' | 'DIESEL'

export type StatusTrigger = 'CALLBACK' | 'SENT_TO_CLIENT' | 'PROSPECT_CLIENT' | 'NONE'

export type CampaignConfig = {
  key: CampaignKey
  label: string

  leadRefPrefix: string

  statusOptions: string[]
  activeStatuses: string[]
  archiveStatuses: string[]
  sourceOptions: string[]

  // ✅ optional — only define what you actually use per campaign
  statusTriggers?: Partial<Record<string, StatusTrigger>>

  // per-campaign extra fields to display & export
  extraColumns: Array<{
    key: string
    label: string
    showInTable?: boolean
    showInExport?: boolean
  }>
}

export const CAMPAIGNS: Record<CampaignKey, CampaignConfig> = {
  ECO4: {
    key: 'ECO4',
    label: 'ECO4 / Boiler',
    leadRefPrefix: 'ECO',

    statusOptions: [
      'New Lead',
      'Prospect Client',
      'Contacted',
      'Qualified',
      'Pending Photos',
      'Sent To Client',
      'Looking for home',
      'Callback',
      'Boiler Above 86%',
      'No Benefits',
      'Dead Number',
      'Not Interested',
      'Voicemail',
      'No Answer',
      'VM 5+ days',
      'NA 5+ days',
    ],

    activeStatuses: [
      'New Lead',
      'Prospect Client',
      'Contacted',
      'Qualified',
      'Pending Photos',
      'Sent To Client',
      'Looking for home',
      'Callback',
      'Voicemail',
      'No Answer',
    ],

    archiveStatuses: [
      'Boiler Above 86%',
      'No Benefits',
      'Dead Number',
      'Not Interested',
      'VM 5+ days',
      'NA 5+ days',
    ],

    sourceOptions: ['Instagram', 'Website', 'Referral', 'WhatsApp', 'Facebook', 'TikTok', 'Other'],

    statusTriggers: {
      Callback: 'CALLBACK',
      'Sent To Client': 'SENT_TO_CLIENT',
      'Prospect Client': 'PROSPECT_CLIENT',
    },

    extraColumns: [
      { key: 'benefits', label: 'Benefits', showInTable: true, showInExport: true },
      { key: 'epc', label: 'EPC', showInTable: true, showInExport: true },
    ],
  },

  SOLAR: {
    key: 'SOLAR',
    label: 'Solar',
    leadRefPrefix: 'SOL',

    statusOptions: [
      'New Lead',
      'Contacted',
      'Qualified',
      'Survey Booked',
      'Quote Sent',
      'Won',
      'Lost',
      'Callback',
      'Voicemail',
      'No Answer',
      'Not Interested',
      'Dead Number',
    ],

    activeStatuses: [
      'New Lead',
      'Contacted',
      'Qualified',
      'Survey Booked',
      'Quote Sent',
      'Callback',
      'Voicemail',
      'No Answer',
    ],

    archiveStatuses: ['Won', 'Lost', 'Not Interested', 'Dead Number'],

    sourceOptions: ['Meta Ads', 'Website', 'Referral', 'TikTok', 'Other'],

    statusTriggers: {
      Callback: 'CALLBACK',
    },

    extraColumns: [
      { key: 'postcode', label: 'Postcode', showInTable: true, showInExport: true },
      { key: 'roof_type', label: 'Roof Type', showInTable: true, showInExport: true },
      { key: 'mpan', label: 'MPAN', showInTable: false, showInExport: true },
    ],
  },

  PCP: {
    key: 'PCP',
    label: 'PCP Claims',
    leadRefPrefix: 'PCP',

    statusOptions: [
      'New Lead',
      'Contacted',
      'Eligible',
      'Not Eligible',
      'Forms Sent',
      'Signed',
      'Submitted',
      'Paid',
      'Callback',
      'Voicemail',
      'No Answer',
      'Dead Number',
      'Not Interested',
    ],

    activeStatuses: ['New Lead', 'Contacted', 'Eligible', 'Forms Sent', 'Signed', 'Submitted', 'Callback', 'Voicemail', 'No Answer'],
    archiveStatuses: ['Not Eligible', 'Paid', 'Dead Number', 'Not Interested'],

    sourceOptions: ['Meta Ads', 'Google', 'Data', 'Referral', 'Other'],

    statusTriggers: {
      Callback: 'CALLBACK',
    },

    extraColumns: [
      { key: 'vehicle_reg', label: 'Reg', showInTable: true, showInExport: true },
      { key: 'lender', label: 'Lender', showInTable: true, showInExport: true },
      { key: 'agreement_type', label: 'Agreement', showInTable: true, showInExport: true },
    ],
  },

  DIESEL: {
    key: 'DIESEL',
    label: 'Diesel Emissions',
    leadRefPrefix: 'DSL',

    statusOptions: ['New Lead', 'Contacted', 'Qualified', 'Docs Requested', 'Submitted', 'Paid', 'Callback', 'Not Interested', 'Dead Number'],

    activeStatuses: ['New Lead', 'Contacted', 'Qualified', 'Docs Requested', 'Submitted', 'Callback'],

    archiveStatuses: ['Paid', 'Not Interested', 'Dead Number'],

    sourceOptions: ['Meta Ads', 'Website', 'Referral', 'Other'],

    statusTriggers: {
      Callback: 'CALLBACK',
    },

    extraColumns: [
      { key: 'vehicle_reg', label: 'Reg', showInTable: true, showInExport: true },
      { key: 'make_model', label: 'Make/Model', showInTable: true, showInExport: true },
      { key: 'year', label: 'Year', showInTable: true, showInExport: true },
    ],
  },
}
