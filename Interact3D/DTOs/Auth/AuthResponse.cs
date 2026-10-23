namespace Interact3D.DTOs.Auth;

public class AuthResponse
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string Role { get; set; } = "User";
    public string? Token { get; set; }
}