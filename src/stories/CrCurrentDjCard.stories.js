// CrCurrentDjCard.stories.tsx
import React from 'react'
import CrCurrentDjCard from './CrCurrentDjCard'

export default {
  title: 'Organisms/CrCurrentDjCard',
  component: CrCurrentDjCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'CrCurrentDjCard uses the CrCurrentDj molecule, the CrButton atom, an image, and additional content elements. This component provides expanded DJ information display showing current DJ details with extended show information and description. More comprehensive than the basic CrCurrentDj molecule. Supports different display states and responsive layouts. Dark mode adapts through [data-theme="dark"] CSS selectors.',
      },
    },
  },
  argTypes: {
    djImage: {
      control: 'text',
      description: 'URL for the DJ image',
    },
    djImageAlt: {
      control: 'text',
      description: 'Alt text for the DJ image',
    },
    djName: {
      control: 'text',
      description: 'Name of the DJ',
    },
    showName: {
      control: 'text',
      description: 'Name of the show',
    },
    isOnAir: {
      control: 'boolean',
      description: 'Whether the show is currently on air',
    },
    description: {
      control: 'text',
      description: 'Description text',
    },
    requestButtonText: {
      control: 'text',
      description: 'Text for the request button',
    },
    moreButtonText: {
      control: 'text',
      description: 'Text for the more button',
    },
    isFavorite: {
      control: 'boolean',
      description: 'Whether this DJ is marked as favorite',
    },
    showRequestButton: {
      control: 'boolean',
      description: 'Show/hide the request button',
    },
    showFavoriteButton: {
      control: 'boolean',
      description: 'Show/hide the favorite button',
    },
    showMoreButton: {
      control: 'boolean',
      description: 'Show/hide the more button',
    },
  },
  tags: ['autodocs'],
}

export const Default = {
  args: {
    djImage: '/images/app-icons/App Icon 1.png',
    djImageAlt: 'DJ Current',
    djName: 'DJ Current',
    showName: 'The Current Show',
    isOnAir: true,
    description:
      'DJ Current is lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam quis risus eget urna mollis ornare vel eu leo. Curabitur blandit tempus porttitor. Donec sed odio dui. Etiam porta sem malesuada magna mollis euismod. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.',
    requestButtonText: 'REQUEST',
    moreButtonText: 'MORE',
    isFavorite: false,
    showRequestButton: true,
    showFavoriteButton: true,
    showMoreButton: true,
    onRequestClick: () => console.log('Request clicked'),
    onMoreClick: () => console.log('More clicked'),
    onFavoriteClick: () => console.log('Favorite clicked'),
  },
}

export const OffAir = {
  args: {
    ...Default.args,
    isOnAir: false,
  },
}

export const LongDescription = {
  args: {
    ...Default.args,
    description:
      'DJ Current brings you an eclectic mix of music spanning multiple genres and decades. From underground electronic beats to classic rock anthems, this show explores the full spectrum of musical expression. Tune in every week for carefully curated playlists and exclusive interviews with emerging artists.',
  },
}

export const DifferentDJ = {
  args: {
    ...Default.args,
    djImage: 'https://images.unsplash.com/photo-1524666041070-9d87656c25bb?w=400&h=400&fit=crop',
    djName: 'DJ Midnight',
    showName: 'After Dark Sessions',
    description:
      'Join DJ Midnight for a journey through the best in late-night electronic music and downtempo beats.',
  },
}

export const Favorite = {
  args: {
    ...Default.args,
    isFavorite: true,
  },
}

export const HiddenButtons = {
  args: {
    ...Default.args,
    showRequestButton: false,
    showFavoriteButton: false,
    showMoreButton: false,
  },
}

export const OnlyMoreButton = {
  args: {
    ...Default.args,
    showRequestButton: false,
    showFavoriteButton: false,
    showMoreButton: true,
  },
}

export const Mobile = {
  args: {
    ...Default.args,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}
