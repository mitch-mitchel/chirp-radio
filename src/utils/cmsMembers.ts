// CMS API utility functions for fetching members/listeners data
import type { User, DonationHistory, PurchaseHistory } from '../types/user'

const CMS_API_URL = import.meta.env.VITE_CMS_API_URL || '/api'

/**
 * Fetch donations for a member
 */
async function fetchDonationsForMember(memberId: string): Promise<DonationHistory[]> {
  try {
    const response = await fetch(
      `${CMS_API_URL}/donations?where[member][equals]=${memberId}&limit=1000`
    )
    if (!response.ok) {
      console.error(`[cmsMembers] Failed to fetch donations for member ${memberId}`)
      return []
    }
    const data = await response.json()

    // Transform CMS donations to frontend format
    return (data.docs || []).map((donation: any) => ({
      id: donation.id,
      date: donation.date,
      type: donation.type,
      amount: donation.amount,
      receiptUrl: donation.receiptUrl,
    }))
  } catch (error) {
    console.error('[cmsMembers] Error fetching donations:', error)
    return []
  }
}

/**
 * Fetch purchases for a member
 */
async function fetchPurchasesForMember(memberId: string): Promise<PurchaseHistory[]> {
  try {
    const response = await fetch(
      `${CMS_API_URL}/purchases?where[member][equals]=${memberId}&limit=1000`
    )
    if (!response.ok) {
      console.error(`[cmsMembers] Failed to fetch purchases for member ${memberId}`)
      return []
    }
    const data = await response.json()

    // Transform CMS purchases to frontend format
    return (data.docs || []).map((purchase: any) => {
      // Create item summary from items array
      const itemSummary =
        purchase.items && purchase.items.length > 0
          ? purchase.items.length === 1
            ? purchase.items[0].productName
            : `${purchase.items[0].productName} +${purchase.items.length - 1} more`
          : 'Unknown Item'

      return {
        id: purchase.id,
        date: purchase.date,
        item: itemSummary,
        amount: purchase.total,
      }
    })
  } catch (error) {
    console.error('[cmsMembers] Error fetching purchases:', error)
    return []
  }
}

/**
 * Transform CMS user data to frontend format
 * CMS stores favoriteDJs as [{ djId: 'id' }], frontend expects ['id']
 */
async function transformCMSUser(cmsUser: any): Promise<User> {
  // Fetch donation and purchase history
  const [donationHistory, purchaseHistory] = await Promise.all([
    fetchDonationsForMember(cmsUser.id),
    fetchPurchasesForMember(cmsUser.id),
  ])

  return {
    ...cmsUser,
    favoriteDJs: Array.isArray(cmsUser.favoriteDJs)
      ? cmsUser.favoriteDJs.map((fav: any) =>
          typeof fav === 'object' && fav.djId ? fav.djId : fav
        )
      : [],
    donationHistory,
    purchaseHistory,
  }
}

/**
 * Fetch all members from CMS
 */
export async function fetchAllMembers(): Promise<User[]> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners?limit=1000`)
    if (!response.ok) {
      throw new Error(`Failed to fetch members: ${response.statusText}`)
    }
    const data = await response.json()
    // Transform all users with their donation/purchase histories
    return await Promise.all((data.docs || []).map(transformCMSUser))
  } catch (error) {
    console.error('[cmsMembers] Error fetching all members:', error)
    throw error
  }
}

/**
 * Fetch regular DJs from CMS
 */
export async function fetchDJs(): Promise<User[]> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners?where[roles][contains]=Regular DJ`)
    if (!response.ok) {
      throw new Error(`Failed to fetch DJs: ${response.statusText}`)
    }
    const data = await response.json()
    return await Promise.all((data.docs || []).map(transformCMSUser))
  } catch (error) {
    console.error('[cmsMembers] Error fetching DJs:', error)
    throw error
  }
}

/**
 * Fetch substitute DJs from CMS
 */
export async function fetchSubstituteDJs(): Promise<User[]> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners?where[roles][contains]=Substitute DJ`)
    if (!response.ok) {
      throw new Error(`Failed to fetch substitute DJs: ${response.statusText}`)
    }
    const data = await response.json()
    return await Promise.all((data.docs || []).map(transformCMSUser))
  } catch (error) {
    console.error('[cmsMembers] Error fetching substitute DJs:', error)
    throw error
  }
}

/**
 * Fetch board members from CMS
 */
export async function fetchBoardMembers(): Promise<User[]> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners?where[roles][contains]=Board Member`)
    if (!response.ok) {
      throw new Error(`Failed to fetch board members: ${response.statusText}`)
    }
    const data = await response.json()
    return await Promise.all((data.docs || []).map(transformCMSUser))
  } catch (error) {
    console.error('[cmsMembers] Error fetching board members:', error)
    throw error
  }
}

/**
 * Fetch volunteers from CMS
 */
export async function fetchVolunteers(): Promise<User[]> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners?where[roles][contains]=Volunteer`)
    if (!response.ok) {
      throw new Error(`Failed to fetch volunteers: ${response.statusText}`)
    }
    const data = await response.json()
    return await Promise.all((data.docs || []).map(transformCMSUser))
  } catch (error) {
    console.error('[cmsMembers] Error fetching volunteers:', error)
    throw error
  }
}

/**
 * Fetch a specific member by ID from CMS
 */
export async function fetchMemberById(id: string): Promise<User | null> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners/${id}`)
    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`Failed to fetch member: ${response.statusText}`)
    }
    const cmsUser = await response.json()
    return await transformCMSUser(cmsUser)
  } catch (error) {
    console.error('[cmsMembers] Error fetching member by ID:', error)
    return null
  }
}

/**
 * Update a member's data in CMS
 */
export async function updateMember(id: string, data: Partial<User>): Promise<User> {
  try {
    const response = await fetch(`${CMS_API_URL}/listeners/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to update member ${id}: ${response.statusText} - ${errorText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[cmsMembers] Error updating member:', error)
    throw error
  }
}
