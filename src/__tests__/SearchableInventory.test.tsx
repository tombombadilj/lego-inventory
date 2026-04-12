import { render, screen, fireEvent } from '@testing-library/react'
import SearchableInventory from '@/components/SearchableInventory'

const makeSets = () => [
  {
    set_id: 'set1',
    set_number: '10270',
    name: 'Bookshop',
    theme: 'Modular Buildings',
    piece_count: 2504,
    retired: false,
    override_retired: null,
    retirement_date: null,
    retiring_soon_override: null,
    override_retirement_date: null,
    minifig_count: null,
    minifig_names: null,
    image_url: null,
    retail_price: 179.99,
    items: [{ id: '1', purchase_price_usd: 150, sets: { set_number: '10270' } } as any],
    total_paid: 150,
  },
  {
    set_id: 'set2',
    set_number: '10297',
    name: 'Boutique Hotel',
    theme: 'Modular Buildings',
    piece_count: 3068,
    retired: false,
    override_retired: null,
    retirement_date: null,
    retiring_soon_override: null,
    override_retirement_date: null,
    minifig_count: null,
    minifig_names: null,
    image_url: null,
    retail_price: 229.99,
    items: [{ id: '2', purchase_price_usd: 200, sets: { set_number: '10297' } } as any],
    total_paid: 200,
  },
]

describe('SearchableInventory', () => {
  it('renders all sets when query is empty', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
  })

  it('filters by set number substring', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '10270' } })
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.queryByText('Boutique Hotel')).not.toBeInTheDocument()
  })

  it('filters by name substring (case-insensitive)', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'book' } })
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.queryByText('Boutique Hotel')).not.toBeInTheDocument()
  })

  it('shows empty state when no sets match', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'zzznomatch' } })
    expect(screen.getByText(/no sets match/i)).toBeInTheDocument()
  })

  it('shows filtered count in heading', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: '10270' } })
    expect(screen.getByText(/active inventory \(1 set\)/i)).toBeInTheDocument()
  })

  it('clears search when × button is clicked', () => {
    render(<SearchableInventory groupedSets={makeSets()} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'book' } })
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getByText('Bookshop')).toBeInTheDocument()
    expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
  })

  it('shows "Add Sets" empty state when inventory itself is empty', () => {
    render(<SearchableInventory groupedSets={[]} />)
    expect(screen.getByText(/no sets yet/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add sets/i })).toBeInTheDocument()
  })

  test('shows red RETIRED badge when retirement_status is Retired', () => {
    const sets = [{
      set_id: 'abc',
      set_number: '10270',
      name: 'Bookshop',
      theme: 'Modular Buildings',
      piece_count: 2504,
      retired: true,
      override_retired: null,
      retirement_date: null,
      retiring_soon_override: null,
      override_retirement_date: null,
      minifig_count: null,
      minifig_names: null,
      image_url: null,
      retail_price: 179.99,
      items: [{ id: '1', purchase_price_usd: 150, sets: { set_number: '10270' } } as any],
      total_paid: 150,
      retirement_status: 'Retired' as const,
    }]
    render(<SearchableInventory groupedSets={sets} />)
    const badge = screen.getByText('RETIRED')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-red-600')
  })

  test('shows amber RETIRING SOON badge when retirement_status is Retiring Soon', () => {
    const sets = [{
      set_id: 'def',
      set_number: '10297',
      name: 'Boutique Hotel',
      theme: 'Modular Buildings',
      piece_count: 3068,
      retired: false,
      override_retired: null,
      retirement_date: null,
      retiring_soon_override: null,
      override_retirement_date: null,
      minifig_count: null,
      minifig_names: null,
      image_url: null,
      retail_price: 229.99,
      items: [{ id: '2', purchase_price_usd: 200, sets: { set_number: '10297' } } as any],
      total_paid: 200,
      retirement_status: 'Retiring Soon' as const,
    }]
    render(<SearchableInventory groupedSets={sets} />)
    const badge = screen.getByText('RETIRING SOON')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-amber-600')
  })

  test('shows no retirement badge when retirement_status is Active', () => {
    const sets = [{
      set_id: 'ghi',
      set_number: '10255',
      name: 'Assembly Square',
      theme: 'Modular Buildings',
      piece_count: 4002,
      retired: false,
      override_retired: null,
      retirement_date: null,
      retiring_soon_override: null,
      override_retirement_date: null,
      minifig_count: null,
      minifig_names: null,
      image_url: null,
      retail_price: 279.99,
      items: [{ id: '3', purchase_price_usd: 250, sets: { set_number: '10255' } } as any],
      total_paid: 250,
      retirement_status: 'Active' as const,
    }]
    render(<SearchableInventory groupedSets={sets} />)
    expect(screen.queryByText('RETIRED')).not.toBeInTheDocument()
    expect(screen.queryByText('RETIRING SOON')).not.toBeInTheDocument()
  })

  describe('filter tabs', () => {
    function makeMixedSets() {
      const base = {
        set_id: '',
        theme: 'Icons',
        piece_count: 2504,
        retired: false,
        override_retired: null,
        retirement_date: null,
        retiring_soon_override: null,
        override_retirement_date: null,
        minifig_count: null,
        minifig_names: null,
        image_url: null,
        retail_price: 179.99,
        items: [],
        total_paid: 150,
      }
      return [
        { ...base, set_id: 's1', set_number: '10270', name: 'Bookshop', recommendation: 'VELOCITY SELL' as const },
        { ...base, set_id: 's2', set_number: '10297', name: 'Boutique Hotel', recommendation: 'SELL' as const },
        { ...base, set_id: 's6', set_number: '10182', name: 'Cafe Corner', recommendation: 'LIQUIDATE' as const },
        { ...base, set_id: 's3', set_number: '10255', name: 'Assembly Square', recommendation: 'HOLD' as const },
        { ...base, set_id: 's4', set_number: '10315', name: 'Tranquil Garden', recommendation: 'STRATEGIC HOLD' as const },
        { ...base, set_id: 's5', set_number: '10698', name: 'Large Creative Brick Box', recommendation: 'NO_DATA' as const },
      ]
    }

    it('shows all sets when All tab is active (default)', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      expect(screen.getByText('Bookshop')).toBeInTheDocument()
      expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
      expect(screen.getByText('Cafe Corner')).toBeInTheDocument()
      expect(screen.getByText('Assembly Square')).toBeInTheDocument()
      expect(screen.getByText('Tranquil Garden')).toBeInTheDocument()
      expect(screen.getByText('Large Creative Brick Box')).toBeInTheDocument()
    })

    it('Sell Now tab shows only VELOCITY SELL, SELL, LIQUIDATE sets', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      fireEvent.click(screen.getByRole('button', { name: /sell now/i }))
      expect(screen.getByText('Bookshop')).toBeInTheDocument()
      expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
      expect(screen.getByText('Cafe Corner')).toBeInTheDocument()
      expect(screen.queryByText('Assembly Square')).not.toBeInTheDocument()
      expect(screen.queryByText('Tranquil Garden')).not.toBeInTheDocument()
      expect(screen.queryByText('Large Creative Brick Box')).not.toBeInTheDocument()
    })

    it('Holding tab shows only STRATEGIC HOLD, HOLD sets', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      fireEvent.click(screen.getByRole('button', { name: /holding/i }))
      expect(screen.queryByText('Bookshop')).not.toBeInTheDocument()
      expect(screen.queryByText('Boutique Hotel')).not.toBeInTheDocument()
      expect(screen.queryByText('Cafe Corner')).not.toBeInTheDocument()
      expect(screen.getByText('Assembly Square')).toBeInTheDocument()
      expect(screen.getByText('Tranquil Garden')).toBeInTheDocument()
      expect(screen.queryByText('Large Creative Brick Box')).not.toBeInTheDocument()
    })

    it('NO_DATA sets are only shown in All tab', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      expect(screen.getByText('Large Creative Brick Box')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /sell now/i }))
      expect(screen.queryByText('Large Creative Brick Box')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /holding/i }))
      expect(screen.queryByText('Large Creative Brick Box')).not.toBeInTheDocument()
    })

    it('Sell Now tab shows count of matching sets', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      fireEvent.click(screen.getByRole('button', { name: /sell now/i }))
      expect(screen.getByText(/sell now \(3 sets\)/i)).toBeInTheDocument()
    })

    it('Holding tab shows count of matching sets', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      fireEvent.click(screen.getByRole('button', { name: /holding/i }))
      expect(screen.getByText(/holding \(2 sets\)/i)).toBeInTheDocument()
    })

    it('search and tab filters compose — Sell Now + search narrows further', () => {
      render(<SearchableInventory groupedSets={makeMixedSets()} />)
      fireEvent.click(screen.getByRole('button', { name: /sell now/i }))
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'boutique' } })
      expect(screen.queryByText('Bookshop')).not.toBeInTheDocument()
      expect(screen.getByText('Boutique Hotel')).toBeInTheDocument()
    })
  })
})
