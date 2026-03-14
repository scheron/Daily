import type {TagModel} from "@/storage/models/TagModel"
import type {Tag} from "@shared/types/storage"

export class TagsService {
  constructor(private tagModel: TagModel) {}

  async getTagList(): Promise<Tag[]> {
    return this.tagModel.getTagList()
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this.tagModel.getTag(id)
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    return this.tagModel.updateTag(id, updates)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    return this.tagModel.createTag(tag)
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    return this.tagModel.deleteTag(id)
  }
}
