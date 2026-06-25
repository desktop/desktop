import * as React from 'react'
import memoizeOne from 'memoize-one'

import { formatCompactNumber, formatNumber } from '../../lib/format-number'
import { DefaultCopilotModel } from '../../lib/stores/copilot-store'
import { type IBYOKProvider, encodeModelKey } from '../../lib/copilot/byok'
import { IFilterListGroup, IFilterListItem } from './filter-list'
import { PopoverDecoration } from './popover'
import { PopoverDropdown } from './popover-dropdown'
import { SectionFilterList } from './section-filter-list'
import type {
  Model,
  ModelBilling,
} from '@github/copilot-sdk/dist/generated/rpc'

interface ICopilotModelPickerProps {
  readonly label: string
  readonly copilotModels: ReadonlyArray<Model>
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly value: string
  readonly onChange: (value: string) => void
  readonly maxHeight?: number
}

interface ICopilotModelPickerState {
  readonly filterText: string
  readonly selectedItemId: string | undefined
}

interface ICopilotModelListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly value: string
  readonly name: string
  readonly billing: ModelBilling | undefined
  readonly modelPickerCategory: string | undefined
  readonly modelPickerPriceCategory: string | undefined
  readonly isDefault: boolean
}

interface ICopilotModelPickerTokenPriceDetails {
  readonly batchSize: string
  readonly inputPrice: string | null
  readonly cachePrice: string | null
  readonly outputPrice: string | null
}

export interface ICopilotModelPickerSelectionInfo {
  readonly name: string
  readonly modelPickerCategory: string | null
  readonly summary: string
  readonly contextWindow: string | null
  readonly reasoningEffortLevels: string | null
  readonly tokenPriceDetails: ICopilotModelPickerTokenPriceDetails | null
}

const ModelPickerCompactRowHeight = 30
const ModelPickerSubtitleRowHeight = 46

const getPremiumRequestsBillingLabel = (billing: ModelBilling | undefined) => {
  const multiplier = billing?.multiplier
  return multiplier === undefined ? '' : ` (${multiplier}x)`
}

const formatModelPickerCategory = (category: string) =>
  category.replace(/_/g, ' ')

const formatModelPickerCategoryHeader = (category: string) => {
  const formattedCategory = formatModelPickerCategory(category)
  return `${formattedCategory.charAt(0).toUpperCase()}${formattedCategory.slice(
    1
  )}`
}

const formatTokenBatchSize = (tokenCount: number) =>
  formatCompactNumber(tokenCount)

const formatReasoningEffortLevels = (
  supportedReasoningEfforts: ReadonlyArray<string> | undefined
) => {
  if (
    supportedReasoningEfforts === undefined ||
    supportedReasoningEfforts.length === 0
  ) {
    return null
  }

  return supportedReasoningEfforts.length === 1
    ? '1 level'
    : `${supportedReasoningEfforts.length} levels`
}

const formatAIModelCreditAmount = (value: number | undefined) =>
  value === undefined ? null : formatNumber(value)

const getTokenPriceDetails = (
  tokenPrices: ModelBilling['tokenPrices']
): ICopilotModelPickerTokenPriceDetails | null => {
  if (tokenPrices === undefined) {
    return null
  }

  const { batchSize } = tokenPrices
  if (batchSize === undefined || batchSize <= 0) {
    return null
  }

  return {
    batchSize: formatTokenBatchSize(batchSize),
    inputPrice: formatAIModelCreditAmount(tokenPrices.inputPrice),
    cachePrice: formatAIModelCreditAmount(tokenPrices.cachePrice),
    outputPrice: formatAIModelCreditAmount(tokenPrices.outputPrice),
  }
}

const getContextWindowTokenCount = (
  promptTokenBudget: number | undefined,
  outputContextTokenCount: number | undefined,
  maxContextWindowTokens: number | undefined
) => {
  return promptTokenBudget === undefined ||
    outputContextTokenCount === undefined
    ? maxContextWindowTokens
    : promptTokenBudget + outputContextTokenCount
}

const getModelPickerPriceCategory = (item: ICopilotModelListItem) => {
  const { billing, modelPickerPriceCategory } = item

  if (
    billing?.tokenPrices === undefined ||
    modelPickerPriceCategory === undefined ||
    modelPickerPriceCategory.trim().length === 0
  ) {
    return null
  }

  return formatModelPickerCategory(modelPickerPriceCategory)
}

const getListItemSubtitle = (item: ICopilotModelListItem) => {
  const modelPickerPriceCategory = getModelPickerPriceCategory(item)
  return modelPickerPriceCategory === null
    ? null
    : `Use of credits: ${modelPickerPriceCategory}`
}

export const getCopilotModelPickerSelectionInfo = (
  copilotModels: ReadonlyArray<Model>,
  value: string
): ICopilotModelPickerSelectionInfo | null => {
  const selectedModel = copilotModels.find(
    model => encodeModelKey({ kind: 'copilot', modelId: model.id }) === value
  )
  const billing = selectedModel?.billing as ModelBilling | undefined
  const tokenPrices = billing?.tokenPrices
  const modelPickerPriceCategory =
    selectedModel?.modelPickerPriceCategory?.trim()

  if (
    selectedModel === undefined ||
    tokenPrices === undefined ||
    modelPickerPriceCategory === undefined ||
    modelPickerPriceCategory.length === 0
  ) {
    return null
  }

  const modelPickerCategory = selectedModel?.modelPickerCategory?.trim()
  const useOfCredits = `Use of credits: ${formatModelPickerCategory(
    modelPickerPriceCategory
  )}`

  const summary =
    modelPickerCategory === undefined || modelPickerCategory.length === 0
      ? useOfCredits
      : `${formatModelPickerCategoryHeader(
          modelPickerCategory
        )} model. ${useOfCredits}`
  const contextWindowTokenCount = getContextWindowTokenCount(
    tokenPrices.contextMax,
    selectedModel.capabilities.limits?.max_output_tokens,
    selectedModel.capabilities.limits?.max_context_window_tokens
  )

  return {
    name: selectedModel.name,
    modelPickerCategory:
      modelPickerCategory === undefined || modelPickerCategory.length === 0
        ? null
        : formatModelPickerCategoryHeader(modelPickerCategory),
    summary,
    contextWindow:
      contextWindowTokenCount === undefined
        ? null
        : formatTokenBatchSize(contextWindowTokenCount),
    reasoningEffortLevels: formatReasoningEffortLevels(
      selectedModel.supportedReasoningEfforts
    ),
    tokenPriceDetails: getTokenPriceDetails(tokenPrices),
  }
}

const getCopilotModelTitle = (item: ICopilotModelListItem) => {
  // The "auto" model routes to different models with varying multipliers, so
  // showing a single multiplier label would be misleading.
  const billingLabel = item.isDefault
    ? ''
    : getPremiumRequestsBillingLabel(item.billing)
  return item.isDefault
    ? `${item.name} (default)`
    : `${item.name}${billingLabel}`
}

const getCopilotModelAriaLabel = (item: ICopilotModelListItem) => {
  const title = getCopilotModelTitle(item)
  const subtitle = getListItemSubtitle(item)

  return subtitle === null ? title : `${title}, ${subtitle}`
}

const getCopilotModelGroups = (
  copilotModels: ReadonlyArray<Model>,
  byokProviders: ReadonlyArray<IBYOKProvider>
): ReadonlyArray<IFilterListGroup<ICopilotModelListItem>> => {
  const groups = new Array<IFilterListGroup<ICopilotModelListItem>>()

  if (copilotModels.length > 0) {
    const providerName = 'GitHub Copilot'
    const uncategorizedItems = new Array<ICopilotModelListItem>()
    const categorizedItems = new Map<string, Array<ICopilotModelListItem>>()

    for (const model of copilotModels) {
      const value = encodeModelKey({
        kind: 'copilot',
        modelId: model.id,
      })
      const modelPickerCategory = model.modelPickerCategory?.trim()
      const modelPickerPriceCategory = model.modelPickerPriceCategory?.trim()
      const item = {
        id: value,
        text: [
          model.name,
          model.id,
          providerName,
          modelPickerCategory ?? '',
          modelPickerPriceCategory ?? '',
        ],
        value,
        name: model.name,
        billing: model.billing as ModelBilling | undefined,
        modelPickerCategory,
        modelPickerPriceCategory,
        isDefault: model.id === DefaultCopilotModel,
      }

      if (
        modelPickerCategory === undefined ||
        modelPickerCategory.length === 0
      ) {
        uncategorizedItems.push(item)
      } else {
        const items = categorizedItems.get(modelPickerCategory) ?? []
        items.push(item)
        categorizedItems.set(modelPickerCategory, items)
      }
    }

    if (uncategorizedItems.length > 0) {
      groups.push({
        identifier: '',
        showHeader: false,
        items: uncategorizedItems,
      })
    }

    for (const [category, items] of categorizedItems) {
      groups.push({
        identifier: formatModelPickerCategoryHeader(category),
        items,
      })
    }
  }

  for (const provider of byokProviders) {
    if (provider.models.length === 0) {
      continue
    }

    groups.push({
      identifier: provider.name,
      items: provider.models.map(model => {
        const value = encodeModelKey({
          kind: 'byok',
          providerId: provider.id,
          modelId: model.id,
        })

        return {
          id: value,
          text: [model.name, model.id, provider.name],
          value,
          name: model.name,
          billing: undefined,
          modelPickerCategory: undefined,
          modelPickerPriceCategory: undefined,
          isDefault: false,
        }
      }),
    })
  }

  return groups
}

export const hasCopilotModelPickerItems = (
  copilotModels: ReadonlyArray<Model>,
  byokProviders: ReadonlyArray<IBYOKProvider>
) =>
  copilotModels.length > 0 ||
  byokProviders.some(provider => provider.models.length > 0)

export class CopilotModelPicker extends React.Component<
  ICopilotModelPickerProps,
  ICopilotModelPickerState
> {
  private readonly popoverRef = React.createRef<PopoverDropdown>()
  private readonly getGroups = memoizeOne(getCopilotModelGroups)
  private readonly getSelectedItem = memoizeOne(
    (
      groups: ReadonlyArray<IFilterListGroup<ICopilotModelListItem>>,
      selectedItemId: string | undefined,
      value: string
    ) => {
      const items = groups.flatMap(group => group.items)
      const selectedItem =
        selectedItemId === undefined
          ? undefined
          : items.find(item => item.id === selectedItemId)

      return selectedItem ?? items.find(item => item.value === value) ?? null
    }
  )
  private readonly getItemByValue = memoizeOne(
    (
      groups: ReadonlyArray<IFilterListGroup<ICopilotModelListItem>>,
      value: string
    ) => groups.flatMap(group => group.items).find(item => item.value === value)
  )

  public constructor(props: ICopilotModelPickerProps) {
    super(props)

    this.state = {
      filterText: '',
      selectedItemId: undefined,
    }
  }

  public componentDidUpdate(prevProps: ICopilotModelPickerProps) {
    if (
      prevProps.value !== this.props.value ||
      prevProps.copilotModels !== this.props.copilotModels ||
      prevProps.byokProviders !== this.props.byokProviders
    ) {
      this.setState({ selectedItemId: undefined })
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (item: ICopilotModelListItem) => {
    this.popoverRef.current?.closePopover()
    this.setState({ selectedItemId: item.id })
    this.props.onChange(item.value)
  }

  private onSelectionChanged = (selectedItem: ICopilotModelListItem | null) => {
    this.setState({ selectedItemId: selectedItem?.id })
  }

  private getRowHeight = ({
    item,
  }: {
    readonly item: ICopilotModelListItem | null
  }) =>
    item !== null && getListItemSubtitle(item) !== null
      ? ModelPickerSubtitleRowHeight
      : ModelPickerCompactRowHeight

  private renderModel = (item: ICopilotModelListItem) => {
    const subtitle = getListItemSubtitle(item)

    return (
      <div className="copilot-model-list-item">
        <div className="info">
          <div className="title">{getCopilotModelTitle(item)}</div>
          {subtitle === null ? null : (
            <div className="subtitle">{subtitle}</div>
          )}
        </div>
      </div>
    )
  }

  private renderButtonContent = (item: ICopilotModelListItem | undefined) => {
    return (
      <div className="copilot-model-picker-button-content">
        <span className="name">
          {item === undefined ? '' : getCopilotModelTitle(item)}
        </span>
      </div>
    )
  }

  private renderGroupHeader = (identifier: string) => {
    return (
      <div className="copilot-model-list-group filter-list-group-header">
        {identifier}
      </div>
    )
  }

  private renderNoItems = () => {
    return <div className="copilot-model-list-empty">No models found.</div>
  }

  private getItemAriaLabel = (item: ICopilotModelListItem) => {
    return getCopilotModelAriaLabel(item)
  }

  private getGroupAriaLabel = (group: number) => {
    const groups = this.getGroups(
      this.props.copilotModels,
      this.props.byokProviders
    )
    const modelGroup = groups[group]

    return modelGroup === undefined || modelGroup.identifier.length === 0
      ? undefined
      : modelGroup.identifier
  }

  public render() {
    const groups = this.getGroups(
      this.props.copilotModels,
      this.props.byokProviders
    )
    const selectedItem = this.getSelectedItem(
      groups,
      this.state.selectedItemId,
      this.props.value
    )
    const buttonItem = this.getItemByValue(groups, this.props.value)
    const buttonAriaLabel = `${this.props.label}: ${
      buttonItem === undefined ? 'None' : getCopilotModelTitle(buttonItem)
    }`
    return (
      <PopoverDropdown
        className="copilot-model-picker"
        contentTitle="Choose a model"
        buttonContent={this.renderButtonContent(buttonItem)}
        buttonAriaLabel={buttonAriaLabel}
        decoration={PopoverDecoration.Bordered}
        label={this.props.label}
        maxHeight={this.props.maxHeight}
        ref={this.popoverRef}
      >
        <SectionFilterList<ICopilotModelListItem>
          className="copilot-model-list"
          rowHeight={this.getRowHeight}
          groups={groups}
          selectedItem={selectedItem}
          renderItem={this.renderModel}
          renderGroupHeader={this.renderGroupHeader}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          invalidationProps={groups}
          onItemClick={this.onItemClick}
          onSelectionChanged={this.onSelectionChanged}
          getItemAriaLabel={this.getItemAriaLabel}
          getGroupAriaLabel={this.getGroupAriaLabel}
          placeholderText="Filter models"
          renderNoItems={this.renderNoItems}
        />
      </PopoverDropdown>
    )
  }
}
