namespace Interact3D.DTOs.Model;

public class ModelDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string FilePath { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public string? BoneStandard { get; set; }
    public bool HasAnimation { get; set; }
    public bool IsSystem { get; set; }
    public bool IsOwnedByUser { get; set; }
}