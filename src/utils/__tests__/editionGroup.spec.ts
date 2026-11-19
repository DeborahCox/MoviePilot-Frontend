import {
  EDITION_GROUP_NAMES,
  EDITION_GROUP_ORDER,
  groupEditionOptions,
  QUICK_EDITION_VALUES,
} from '@/utils/editionGroup'
import { describe, expect, it } from 'vitest'

describe('groupEditionOptions', () => {
  it('keeps the five groups in the confirmed order and never rewrites values', () => {
    const values = [
      '全网',
      'BluRay HDR',
      'UHD BluRay HDR',
      'UHD BluRay',
      'WEB-DL',
      'WEB',
      'WEB-DL HDR10+',
      'HDR10 DoVi',
      'UHD HDR',
      'UHD BluRayPlus HDR10+',
    ]
    const groups = groupEditionOptions(values)

    expect(groups.map(group => group.id)).toEqual(EDITION_GROUP_ORDER)
    expect(groups.map(group => group.name)).toEqual(Object.values(EDITION_GROUP_NAMES))
    expect(groups.flatMap(group => group.items).slice().sort()).toEqual(values.slice().sort())
    expect([...(groups.find(group => group.id === 'other')?.items ?? [])].sort()).toEqual(
      ['全网', 'HDR10 DoVi', 'UHD HDR'].sort(),
    )
    expect(groups.find(group => group.id === 'webdl')?.items).toEqual(['WEB-DL HDR10+', 'WEB-DL'])
    expect(groups.find(group => group.id === 'web')?.items).toEqual(['WEB'])
    expect(groups.find(group => group.id === 'uhd')?.items).toContain('UHD BluRayPlus HDR10+')
  })

  it('prefers the longest medium token instead of guessing a shorter bucket', () => {
    const groups = groupEditionOptions(['UHD BluRay REMUX DV', 'UHD BluRay', 'BluRay REMUX', 'BluRayPlus', 'WEB-DL HDR'])

    expect(groups.find(group => group.id === 'uhd')?.items).toEqual([
      'UHD BluRay REMUX DV',
      'UHD BluRay',
      'BluRayPlus',
    ])
    expect(groups.find(group => group.id === 'bd')?.items).toEqual(['BluRay REMUX'])
    expect(groups.find(group => group.id === 'webdl')?.items).toEqual(['WEB-DL HDR'])
  })

  it('routes ambiguous or medium-less strings to the last group', () => {
    const groups = groupEditionOptions([
      'UHD BluRay WEB-DL',
      'BluRay WEB',
      '全网',
      'HDR10 DoVi',
      'UHD HDR',
      'UHD',
    ])

    expect([...(groups.find(group => group.id === 'other')?.items ?? [])].sort()).toEqual(
      ['UHD BluRay WEB-DL', 'BluRay WEB', '全网', 'HDR10 DoVi', 'UHD HDR'].sort(),
    )
    expect(groups.find(group => group.id === 'uhd')?.items).toEqual(['UHD'])
  })

  it('sorts HDR10+ before HDR10 before HDR and keeps DV/DoVi wording intact', () => {
    const groups = groupEditionOptions([
      'WEB-DL HDR',
      'WEB-DL DV HDR',
      'WEB-DL HDR10',
      'WEB-DL HDR10+ DV',
      'WEB-DL HDR10+',
    ])

    expect(groups.find(group => group.id === 'webdl')?.items).toEqual([
      'WEB-DL HDR10+ DV',
      'WEB-DL HDR10+',
      'WEB-DL HDR10',
      'WEB-DL DV HDR',
      'WEB-DL HDR',
    ])
    expect(groups.flatMap(group => group.items)).toContain('WEB-DL HDR10+ DV')
    expect(groups.flatMap(group => group.items)).toContain('WEB-DL DV HDR')
  })

  it('is complete for any input and deduplicates values without inventing new ones', () => {
    const values = [
      '全网',
      'BluRay HDR',
      'UHD BluRay HDR',
      'UHD BluRay',
      'BluRay',
      'UHD BluRay REMUX',
      'WEB-DL DoVi',
      'UHD BluRay DIY',
      'WEB-DL HDR10+',
      'WEB-DL',
      'BluRay REMUX',
      'WEB-DL HDR',
      'BluRay SDR',
      'UHD BluRay REMUX DIY',
      'WEB-DL HDR DV',
      'UHD BluRay REMUX HDR DV',
      'WEB-DL DV',
      'WEB-DL HDR10+ DV',
      'WEB-DL HDR10 DoVi',
      'HDR10 DoVi',
      'UHD BluRay REMUX HDR',
      'UHD BluRayPlus HDR10+',
      'UHD BluRay REMUX DV',
      'WEB-DL DV HDR',
      'UHD HDR',
      'WEB-DL HDR10',
      'WEB',
    ]
    const groups = groupEditionOptions(values)
    const grouped = groups.flatMap(group => group.items)

    expect(grouped).toHaveLength(values.length)
    expect(new Set(grouped).size).toBe(values.length)
    expect(grouped.slice().sort()).toEqual(values.slice().sort())
    expect(groups.reduce((total, group) => total + group.items.length, 0)).toBe(values.length)
    expect(QUICK_EDITION_VALUES.every(value => values.includes(value))).toBe(true)
  })
})
