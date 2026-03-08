'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { FileEdge, FileNode } from '@/lib/api'

interface FileGraphProps {
  nodes: FileNode[]
  edges: FileEdge[]
}

interface TreeNode {
  id: string
  name: string
  path: string
  type: 'folder' | FileNode['type']
  size: number
  isFolder: boolean
  children: TreeNode[]
  outgoingImports: number
  incomingImports: number
  fileCount: number
}

interface NodeVisual {
  color: string
  icon: string
}

const TYPE_VISUALS: Record<TreeNode['type'], NodeVisual> = {
  folder: { color: '#94a3b8', icon: '□' },
  page: { color: '#22c55e', icon: '●' },
  api: { color: '#f97316', icon: '●' },
  component: { color: '#06b6d4', icon: '●' },
  lib: { color: '#a855f7', icon: '●' },
  config: { color: '#eab308', icon: '●' },
  util: { color: '#3b82f6', icon: '●' },
}

const BRANCH_COLORS = ['#38bdf8', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#14b8a6']

const BG_COLOR = '#0f172a'
const PANEL_BG = 'rgba(15, 23, 42, 0.9)'
const TEXT_COLOR = '#f1f5f9'
const TEXT_MUTED = '#94a3b8'
const BORDER_COLOR = '#334155'
const LINK_COLOR = '#475569'
const ACCENT = '#38bdf8'

function branchColor(depth: number): string {
  return BRANCH_COLORS[Math.max(0, depth) % BRANCH_COLORS.length]
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
}

function pathSegments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean)
}

function sharedPrefixLength(paths: string[][]): number {
  if (paths.length === 0) return 0

  const shortest = Math.min(...paths.map((parts) => parts.length))
  let length = 0

  for (let index = 0; index < shortest; index += 1) {
    const segment = paths[0][index]
    const allMatch = paths.every((parts) => parts[index] === segment)

    if (!allMatch) {
      break
    }

    length += 1
  }

  return length
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildImportMaps(edges: FileEdge[]): {
  outgoingBySource: Map<string, number>
  incomingByTarget: Map<string, number>
} {
  const outgoingBySource = new Map<string, number>()
  const incomingByTarget = new Map<string, number>()

  edges.forEach((edge) => {
    outgoingBySource.set(edge.source, (outgoingBySource.get(edge.source) || 0) + 1)
    incomingByTarget.set(edge.target, (incomingByTarget.get(edge.target) || 0) + 1)
  })

  return { outgoingBySource, incomingByTarget }
}

function sortChildren(node: TreeNode): TreeNode {
  const children = node.children.map(sortChildren).sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return {
    ...node,
    children,
  }
}

function addFolderStats(node: TreeNode): TreeNode {
  if (!node.isFolder) {
    return node
  }

  const children = node.children.map(addFolderStats)
  const totals = children.reduce(
    (acc, child) => {
      acc.fileCount += child.fileCount
      acc.outgoingImports += child.outgoingImports
      acc.incomingImports += child.incomingImports
      return acc
    },
    { fileCount: 0, outgoingImports: 0, incomingImports: 0 }
  )

  return {
    ...node,
    children,
    fileCount: totals.fileCount,
    outgoingImports: totals.outgoingImports,
    incomingImports: totals.incomingImports,
  }
}

function buildFileTree(
  nodes: FileNode[],
  outgoingBySource: Map<string, number>,
  incomingByTarget: Map<string, number>
): TreeNode[] {
  const root: TreeNode = {
    id: 'root',
    name: '/',
    path: '/',
    type: 'folder',
    size: 0,
    isFolder: true,
    children: [],
    outgoingImports: 0,
    incomingImports: 0,
    fileCount: 0,
  }

  const folderByPath = new Map<string, TreeNode>()
  folderByPath.set('/', root)

  const segmentsByNode = nodes.map((node) => pathSegments(node.path))
  const commonPrefix = sharedPrefixLength(segmentsByNode)

  nodes.forEach((fileNode, nodeIndex) => {
    const relativeParts = segmentsByNode[nodeIndex].slice(commonPrefix)
    const parts = relativeParts.length > 0 ? relativeParts : [fileNode.name]

    if (parts.length === 0) return

    let parent = root
    let currentPath = ''

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1
      currentPath = `${currentPath}/${part}`

      if (isLeaf) {
        parent.children.push({
          id: fileNode.id,
          name: fileNode.name,
          path: fileNode.path,
          type: fileNode.type,
          size: fileNode.size,
          isFolder: false,
          children: [],
          outgoingImports: outgoingBySource.get(fileNode.id) || 0,
          incomingImports: incomingByTarget.get(fileNode.id) || 0,
          fileCount: 1,
        })
        return
      }

      let folder = folderByPath.get(currentPath)

      if (!folder) {
        folder = {
          id: `dir:${currentPath}`,
          name: part,
          path: currentPath,
          type: 'folder',
          size: 0,
          isFolder: true,
          children: [],
          outgoingImports: 0,
          incomingImports: 0,
          fileCount: 0,
        }
        folderByPath.set(currentPath, folder)
        parent.children.push(folder)
      }

      parent = folder
    })
  })

  return sortChildren(addFolderStats(root)).children
}

function filterTree(nodes: TreeNode[], query: string, selectedFilter: string | null): TreeNode[] {
  const normalizedQuery = query.trim().toLowerCase()

  const visit = (node: TreeNode): TreeNode | null => {
    const children = node.children
      .map(visit)
      .filter((child): child is TreeNode => child !== null)

    const matchesQuery =
      normalizedQuery.length === 0 ||
      node.name.toLowerCase().includes(normalizedQuery) ||
      node.path.toLowerCase().includes(normalizedQuery)

    const matchesType = !selectedFilter || node.isFolder || node.type === selectedFilter

    if ((matchesQuery && matchesType) || children.length > 0) {
      return {
        ...node,
        children,
      }
    }

    return null
  }

  return nodes.map(visit).filter((node): node is TreeNode => node !== null)
}

function collectFolderIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []

  const visit = (node: TreeNode): void => {
    if (node.isFolder) {
      ids.push(node.id)
    }
    node.children.forEach(visit)
  }

  nodes.forEach(visit)
  return ids
}

function nodeMeta(node: TreeNode): string {
  if (node.isFolder) {
    return `${node.fileCount} files • imports ${node.outgoingImports}`
  }

  return `${node.type} • ${formatSize(node.size)} • out ${node.outgoingImports} • in ${node.incomingImports}`
}

export default function FileGraph({ nodes, edges }: FileGraphProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null)

  const { outgoingBySource, incomingByTarget } = useMemo(
    () => buildImportMaps(edges),
    [edges]
  )

  const treeData = useMemo(
    () => buildFileTree(nodes, outgoingBySource, incomingByTarget),
    [nodes, outgoingBySource, incomingByTarget]
  )

  const filteredTree = useMemo(
    () => filterTree(treeData, searchQuery, selectedFilter),
    [treeData, searchQuery, selectedFilter]
  )

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    nodes.forEach((node) => {
      counts[node.type] = (counts[node.type] || 0) + 1
    })
    return counts
  }, [nodes])

  const isSearching = searchQuery.trim().length > 0 || !!selectedFilter

  const visibleNodeCount = useMemo(() => {
    let count = 0

    const visit = (node: TreeNode): void => {
      count += 1

      if (!node.isFolder) {
        return
      }

      if (!isSearching && !expandedFolders.has(node.id)) {
        return
      }

      node.children.forEach(visit)
    }

    filteredTree.forEach(visit)
    return count
  }, [filteredTree, expandedFolders, isSearching])

  const canvasHeight = useMemo(
    () => Math.max(dimensions.height, visibleNodeCount * 88 + 120),
    [dimensions.height, visibleNodeCount]
  )

  useEffect(() => {
    const updateDimensions = () => {
      if (viewportRef.current) {
        const nextWidth = viewportRef.current.clientWidth
        const nextHeight = viewportRef.current.clientHeight

        setDimensions((prev) => {
          if (prev.width === nextWidth && prev.height === nextHeight) {
            return prev
          }

          return {
            width: nextWidth,
            height: nextHeight,
          }
        })
      }
    }

    updateDimensions()
    const handleResize = () => updateDimensions()
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | null = null

    if (viewportRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateDimensions())
      resizeObserver.observe(viewportRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    const folderIds = collectFolderIds(treeData)
    setExpandedFolders(new Set(folderIds))
  }, [treeData])

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (filteredTree.length === 0) return
    if (dimensions.width < 24 || canvasHeight < 24) return

    const width = dimensions.width
    const height = canvasHeight
    svg.attr('width', width)
    svg.attr('height', height)
    svg.attr('viewBox', [0, 0, width, height])

    const g = svg.append('g')

    const rootData: TreeNode = {
      id: 'root',
      name: '/',
      path: '/',
      type: 'folder',
      size: 0,
      isFolder: true,
      children: filteredTree,
      outgoingImports: 0,
      incomingImports: 0,
      fileCount: 0,
    }

    const root = d3.hierarchy(rootData, (d) => {
      if (d.id === 'root') return d.children
      if (!d.isFolder) return []
      if (isSearching) return d.children
      return expandedFolders.has(d.id) ? d.children : []
    })

    d3.tree<TreeNode>().nodeSize([74, 1])(root)

    const descendants = root.descendants()
    const maxDepth = d3.max(descendants, (d) => d.depth) || 1
    const depthSpacing = Math.max(120, Math.min(220, (width - 120) / maxDepth))

    descendants.forEach((node) => {
      node.y = node.depth * depthSpacing
    })

    g
      .selectAll<SVGPathElement, d3.HierarchyLink<TreeNode>>('.file-link')
      .data(root.links())
      .join('path')
      .attr('class', 'file-link')
      .attr('d', (d) => {
        const sx = d.source.x ?? 0
        const sy = d.source.y ?? 0
        const tx = d.target.x ?? 0
        const ty = d.target.y ?? 0
        const midY = sy + (ty - sy) * 0.5
        return `M${sy},${sx} C${midY},${sx} ${midY},${tx} ${ty},${tx}`
      })
      .attr('fill', 'none')
      .attr('stroke', (d) => branchColor(Math.max(0, d.target.depth - 1)))
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', 2.4)

    const nodesSelection = g
      .selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('.file-node')
      .data(root.descendants().filter((d) => d.data.id !== 'root'))
      .join('g')
      .attr('class', 'file-node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', (d) => (d.data.isFolder ? 'pointer' : 'default'))
      .on('click', (event, d) => {
        event.stopPropagation()
        if (!d.data.isFolder) return
        setExpandedFolders((prev) => {
          const next = new Set(prev)
          if (next.has(d.data.id)) {
            next.delete(d.data.id)
          } else {
            next.add(d.data.id)
          }
          return next
        })
      })
      .on('mouseenter', (event, d) => setHoveredNode(d.data))
      .on('mouseleave', () => setHoveredNode(null))

    nodesSelection
      .filter((d) => d.data.isFolder)
      .append('rect')
      .attr('x', -11)
      .attr('y', -11)
      .attr('width', 22)
      .attr('height', 22)
      .attr('rx', 6)
      .attr('fill', '#8fa3bf')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 1.5)

    nodesSelection
      .filter((d) => !d.data.isFolder)
      .append('circle')
      .attr('r', 11)
      .attr('fill', (d) => TYPE_VISUALS[d.data.type].color)
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 1.5)

    nodesSelection
      .filter((d) => d.data.isFolder && d.data.children.length > 0)
      .append('circle')
      .attr('r', 6)
      .attr('cx', 0)
      .attr('cy', 14)
      .attr('fill', '#334155')
      .attr('stroke', '#475569')

    nodesSelection
      .filter((d) => d.data.isFolder && d.data.children.length > 0)
      .append('text')
      .attr('x', 0)
      .attr('y', 17)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', TEXT_COLOR)
      .text((d) => {
        if (isSearching) return '-'
        return expandedFolders.has(d.data.id) ? '-' : '+'
      })

    nodesSelection
      .append('text')
      .attr('x', 20)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('font-weight', 500)
      .attr('fill', TEXT_COLOR)
      .attr('font-family', 'system-ui, sans-serif')
      .text((d) => d.data.name)

    nodesSelection
      .append('text')
      .attr('x', 20)
      .attr('y', 18)
      .attr('font-size', '9px')
      .attr('fill', TEXT_MUTED)
      .attr('font-family', 'system-ui, sans-serif')
      .text((d) => nodeMeta(d.data))

    const bounds = g.node()?.getBBox()
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const topPadding = 28
      const leftPadding = 26
      const translateX = leftPadding - bounds.x
      const translateY = topPadding - bounds.y

      g.attr('transform', `translate(${translateX}, ${translateY})`)
    }
  }, [filteredTree, dimensions, expandedFolders, isSearching, canvasHeight])

  if (nodes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: TEXT_MUTED,
          fontSize: '14px',
        }}
      >
        No source files found in this project.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG_COLOR }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          background: PANEL_BG,
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={searchQuery}
          placeholder="Search files or paths"
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: '220px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: `1px solid ${BORDER_COLOR}`,
            background: '#0b1222',
            color: TEXT_COLOR,
            fontSize: '12px',
            outline: 'none',
          }}
        />

        <button
          onClick={() => setSelectedFilter(null)}
          style={{
            border: `1px solid ${selectedFilter ? BORDER_COLOR : ACCENT}`,
            borderRadius: '999px',
            background: selectedFilter ? '#0b1222' : 'rgba(56, 189, 248, 0.15)',
            color: selectedFilter ? TEXT_MUTED : '#7dd3fc',
            padding: '6px 10px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          all ({nodes.length})
        </button>

        {Object.entries(typeCounts).map(([type, count]) => {
          const active = selectedFilter === type
          const visual = TYPE_VISUALS[type as TreeNode['type']] || TYPE_VISUALS.util

          return (
            <button
              key={type}
              onClick={() => setSelectedFilter((prev) => (prev === type ? null : type))}
              style={{
                border: `1px solid ${active ? visual.color : BORDER_COLOR}`,
                borderRadius: '999px',
                background: active ? `${visual.color}1f` : '#0b1222',
                color: visual.color,
                padding: '6px 10px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {type} ({count})
            </button>
          )
        })}
      </div>

      <div ref={viewportRef} style={{ flex: 1, position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
        <svg
          ref={svgRef}
          style={{ width: '100%', height: `${canvasHeight}px`, background: BG_COLOR, display: 'block' }}
        />

        {filteredTree.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: TEXT_MUTED,
              fontSize: '13px',
            }}
          >
            No matching files found.
          </div>
        ) : null}

        {hoveredNode ? (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: 'rgba(30, 41, 59, 0.95)',
              border: `1px solid ${BORDER_COLOR}`,
              borderRadius: '10px',
              padding: '10px 12px',
              maxWidth: '360px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              color: TEXT_COLOR,
              fontSize: '12px',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hoveredNode.path}</div>
            <div style={{ color: TEXT_MUTED }}>{nodeMeta(hoveredNode)}</div>
          </div>
        ) : null}

        <div
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            background: PANEL_BG,
            border: `1px solid ${BORDER_COLOR}`,
            borderRadius: '8px',
            padding: '8px 10px',
            color: TEXT_COLOR,
            fontSize: '11px',
          }}
        >
          {nodes.length} files • {edges.length} imports
        </div>
      </div>
    </div>
  )
}
