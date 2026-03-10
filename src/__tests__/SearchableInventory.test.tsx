import { render, screen, fireEvent } from '@testing-library/react'
import SearchableInventory from '@/components/SearchableInventory'

const makeSets = () => [
  {
    set_number: '10270',
    name: 'Bookshop',
    theme: 'Modular Buildings',
    piece_count: 2504,
    retired: false,
    image_url: null,
    retail_price: 179.99,
    items: [{ id: '1', purchase_price_usd: 150, sets: { set_number: '10270' } } as any],
    total_paid: 150,
  },
  {
    set_number: '10297',
    name: 'Boutique Hotel',
    theme: 'Modular Buildings',
    piece_count: 3068,
    retired: false,
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
})
