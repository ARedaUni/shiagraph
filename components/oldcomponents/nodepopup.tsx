import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Users, Tag, ArrowUpRight, Link as LinkIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface NodePopupProps {
  node: {
    name: string 
    group: string
    description: string
    connections: Array<{ name: string; strength: number }>
  } | null
  onClose: () => void
  sidebarHeight: string
  isSidebarOpen: boolean
}

export default function NodePopup({ node, onClose, sidebarHeight, isSidebarOpen }: NodePopupProps) {
  const [popupHeight, setPopupHeight] = useState('calc(100vh - 2rem)')
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0)
  const verticalMargin = 32// Reduced from 32
  const bottomSafeArea = 24 // Reduced from 64 to minimize bottom margin

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
      updatePopupHeight()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Calculate popup height
  const updatePopupHeight = () => {
    const viewportHeight = window.innerHeight
    const isMobile = windowWidth < 640
    
    if (isSidebarOpen) {
      const sidebarHeightValue = parseInt(sidebarHeight, 10)
      const topMargin = isMobile ? 16 : verticalMargin
      const minHeight = isMobile ? 250 : 300
      const availableHeight = viewportHeight - sidebarHeightValue - topMargin - bottomSafeArea
      
      const newHeight = Math.min(
        Math.max(availableHeight, minHeight),
        viewportHeight - sidebarHeightValue - topMargin - bottomSafeArea
      )
      setPopupHeight(`${newHeight}px`)
    } else {
      // When sidebar is collapsed, maintain proper spacing from top
      const topOffset = 64 // Height of collapsed sidebar header
      const maxHeight = viewportHeight - topOffset - bottomSafeArea
      setPopupHeight(`${isSidebarOpen ? maxHeight: maxHeight * 0.95}px`)
    }
  }

  // Update height when dependencies change
  useEffect(() => {
    updatePopupHeight()
  }, [sidebarHeight, isSidebarOpen, windowWidth])

  if (!node) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'absolute',
          top: isSidebarOpen 
            ? `calc(${sidebarHeight} + ${verticalMargin}px)`
            : '100px', // Position below collapsed sidebar header
          right: windowWidth < 640 ? '0.5rem' : '1rem',
          width: windowWidth < 640 ? 'calc(100vw - 1rem)' : '300px',
          height: popupHeight,
          maxHeight: popupHeight,
          zIndex: 20,
        }}
        className="pointer-events-none"
      >
        <Card className="w-full h-full pointer-events-auto overflow-hidden flex flex-col bg-gray-900 text-gray-100 rounded-2xl shadow-2xl border border-gray-700">
          <CardHeader className="relative pb-4 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 sm:right-4 top-3 sm:top-4 text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-full"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
            <CardTitle className="text-xl sm:text-2xl font-bold text-gray-100 tracking-tight pr-8 break-words">
              {node.name}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-grow px-4 sm:px-6">
            <CardContent className="space-y-4 sm:space-y-6 pb-4">
              <div className="flex items-center space-x-2 sm:space-x-4 flex-wrap gap-y-2">
                <Badge variant="secondary" className="bg-gray-800 text-gray-100 px-2 sm:px-3 py-1 rounded-full text-sm">
                  <Users className="h-3 w-3 mr-1 inline-block" />
                  {node.group}
                </Badge>
                <Badge variant="outline" className="text-blue-400 border-blue-400 px-2 sm:px-3 py-1 rounded-full text-sm">
                  <Tag className="h-3 w-3 mr-1 inline-block" />
                  Node
                </Badge>
              </div>
              <Separator className="bg-gray-800" />
              <div className="space-y-2 sm:space-y-3">
                <h3 className="font-semibold flex items-center text-gray-100 text-base sm:text-lg">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 mr-2" />
                  Description
                </h3>
                <p className="text-gray-300 leading-relaxed text-sm">{node.description}</p>
              </div>
              <Separator className="bg-gray-800" />
              <div className="space-y-2 sm:space-y-3">
                <h3 className="font-semibold flex items-center text-gray-100 text-base sm:text-lg">
                  <LinkIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 mr-2" />
                  Most Prominent Connections
                </h3>
                <ul className="space-y-2">
                  {node.connections?.slice(0, 3).map((connection, index) => (
                    <li key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">{connection.name}</span>
                      <Badge variant="secondary" className="bg-gray-800">
                        {connection.strength.toFixed(2)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <Separator className="bg-gray-800" />
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  className="w-full text-blue-400 border-blue-400 hover:bg-blue-400 hover:text-gray-900 text-sm sm:text-base"
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </div>
            </CardContent>
          </ScrollArea>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}